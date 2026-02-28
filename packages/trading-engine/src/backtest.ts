import type {
  BacktestEngineInput,
  BacktestMetrics,
  BacktestResult,
  BacktestTimelineEvent,
  Candle,
  EnterPositionIntent,
  EquityPoint,
  PositionManagementPlan,
  SimulatedFill,
  SimulatedOrder,
  SimulatedPosition,
  Side,
  StrategyDecision,
  TakeProfitInstruction,
  TradingIntent,
} from "./types";

function feeFor(price: number, quantity: number, feeRate: number): number {
  return Math.abs(price * quantity) * feeRate;
}

function applySlippage(
  price: number,
  side: Side,
  kind: "entry" | "exit",
  bps: number,
): number {
  if (!Number.isFinite(bps) || bps <= 0) return price;
  const move = price * (bps / 10_000);
  if (kind === "entry") {
    return side === "long" ? price + move : price - move;
  }
  return side === "long" ? price - move : price + move;
}

function grossPnlFor(
  side: Side,
  entry: number,
  exit: number,
  qty: number,
): number {
  return side === "long" ? (exit - entry) * qty : (entry - exit) * qty;
}

function targetTouched(
  side: Side,
  candle: Candle,
  targetPrice: number,
): boolean {
  return side === "long"
    ? candle.high >= targetPrice
    : candle.low <= targetPrice;
}

function stopTouched(side: Side, candle: Candle, stopPrice: number): boolean {
  return side === "long" ? candle.low <= stopPrice : candle.high >= stopPrice;
}

function computeMaxDrawdownPct(equityCurve: EquityPoint[]): number {
  if (equityCurve.length === 0) return 0;
  let peak = equityCurve[0]?.equity ?? 0;
  let maxDd = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak <= 0) continue;
    const dd = (peak - point.equity) / peak;
    maxDd = Math.max(maxDd, dd);
  }
  return maxDd;
}

function buildMetrics<TMeta>(
  positions: SimulatedPosition<TMeta>[],
  endingEquity: number,
  maxDrawdownPct: number,
): BacktestMetrics {
  const closed = positions.filter(
    (position) => position.closedAtMs !== undefined,
  );
  const totalTrades = closed.length;
  const netPnl = closed.reduce(
    (acc, position) => acc + position.realizedPnl - position.entryFee,
    0,
  );
  const wins = closed.filter(
    (position) => position.realizedPnl - position.entryFee > 0,
  ).length;
  const losses = closed.filter(
    (position) => position.realizedPnl - position.entryFee < 0,
  ).length;
  const grossProfit = closed
    .map((position) => position.realizedPnl - position.entryFee)
    .filter((pnl) => pnl > 0)
    .reduce((acc, pnl) => acc + pnl, 0);
  const grossLoss = Math.abs(
    closed
      .map((position) => position.realizedPnl - position.entryFee)
      .filter((pnl) => pnl < 0)
      .reduce((acc, pnl) => acc + pnl, 0),
  );

  return {
    totalTrades,
    wins,
    losses,
    winRate: totalTrades === 0 ? 0 : wins / totalTrades,
    netPnl,
    grossProfit,
    grossLoss,
    maxDrawdownPct,
    endingEquity,
  };
}

interface ActivePosition<TMeta> extends SimulatedPosition<TMeta> {
  entryPrice: number;
  management?: PositionManagementPlan;
}

function clonePosition<TMeta>(
  position: ActivePosition<TMeta>,
): SimulatedPosition<TMeta> {
  return {
    ...position,
    fills: [...position.fills],
    strategyContext: position.strategyContext
      ? { ...position.strategyContext }
      : undefined,
    management: position.management
      ? {
          ...position.management,
          takeProfits: position.management.takeProfits?.map((item) => ({
            ...item,
          })),
        }
      : undefined,
  };
}

function closeFillReason(label: string): SimulatedFill["reason"] {
  return label === "stop"
    ? "stop"
    : label === "signal"
      ? "signal"
      : label === "end"
        ? "end"
        : "tp";
}

export function runBacktestEngine<TConfig, TSnapshot, TMeta = unknown>(
  input: BacktestEngineInput<TConfig, TSnapshot, TMeta>,
): BacktestResult<TMeta> {
  const executionCandles = input.market.executionCandles;
  const feeRate = input.request.feeModel.rate;
  const slippageBps =
    input.request.slippageModel.type === "fixed-bps"
      ? (input.request.slippageModel.bps ?? 0)
      : 0;

  let equity = input.request.initialEquity;
  let cooldownUntilIndex = -1;
  let nextPositionId = 1;
  let nextOrderId = 1;
  let nextFillId = 1;

  let activePosition: ActivePosition<TMeta> | null = input.initialPosition
    ? (() => {
        const strategyEntryPrice =
          input.initialPosition?.strategyContext?.["entryPrice"];
        const normalizedStrategyEntryPrice =
          typeof strategyEntryPrice === "number"
            ? strategyEntryPrice
            : undefined;

        return {
          ...input.initialPosition,
          entryPrice:
            input.initialPosition.avgEntryPrice ??
            normalizedStrategyEntryPrice ??
            input.initialPosition.closePrice ??
            0,
        };
      })()
    : null;

  const positions: SimulatedPosition<TMeta>[] = [];
  const orders: SimulatedOrder[] = [];
  const fills: SimulatedFill[] = [];
  const equityCurve: EquityPoint[] = [];
  const timeline: BacktestTimelineEvent[] = [];

  const closePortion = (
    candle: Candle,
    label: string,
    quantity: number,
    rawPrice: number,
  ) => {
    if (!activePosition || quantity <= 0) return;
    const qty = Math.min(quantity, activePosition.remainingQuantity);
    if (qty <= 0) return;

    const exitPrice = applySlippage(
      rawPrice,
      activePosition.side,
      "exit",
      slippageBps,
    );
    const fee = feeFor(exitPrice, qty, feeRate);
    const grossPnl = grossPnlFor(
      activePosition.side,
      activePosition.entryPrice,
      exitPrice,
      qty,
    );
    const netPnl = grossPnl - fee;

    equity += netPnl;
    activePosition.remainingQuantity -= qty;
    activePosition.realizedPnl += netPnl;

    const orderId = `order-${nextOrderId++}`;
    const fillId = `fill-${nextFillId++}`;

    const order: SimulatedOrder = {
      id: orderId,
      botId: input.bot.id,
      positionId: activePosition.positionId,
      side: activePosition.side,
      purpose:
        label === "stop"
          ? "stop"
          : label === "signal" || label === "end"
            ? "close"
            : "take-profit",
      status: "filled",
      requestedPrice: rawPrice,
      executedPrice: exitPrice,
      requestedQuantity: qty,
      executedQuantity: qty,
      createdAtMs: candle.time,
      updatedAtMs: candle.time,
    };
    orders.push(order);

    const fill: SimulatedFill = {
      id: fillId,
      orderId,
      positionId: activePosition.positionId,
      botId: input.bot.id,
      reason: closeFillReason(label),
      label,
      side: activePosition.side,
      time: candle.time,
      price: exitPrice,
      quantity: qty,
      grossPnl,
      fee,
      netPnl,
    };
    fills.push(fill);
    activePosition.fills.push(fill);

    if (activePosition.remainingQuantity <= 1e-10) {
      activePosition.remainingQuantity = 0;
      activePosition.status = "closed";
      activePosition.closedAtMs = candle.time;
      activePosition.closePrice = exitPrice;
      positions.push(clonePosition(activePosition));
      timeline.push({
        time: candle.time,
        type: "position.closed",
        positionId: activePosition.positionId,
        message: `Position closed via ${label}`,
      });
      activePosition = null;
    } else {
      activePosition.status = "reducing";
      timeline.push({
        time: candle.time,
        type: "position.reduced",
        positionId: activePosition.positionId,
        message: `Position reduced via ${label}`,
        data: { remainingQuantity: activePosition.remainingQuantity },
      });
    }
  };

  const processManagementPlan = (
    candle: Candle,
    management: PositionManagementPlan | undefined,
    decision: StrategyDecision<TMeta>,
  ) => {
    if (!activePosition) return;

    const targets = [...(management?.takeProfits ?? [])].sort((left, right) => {
      if (activePosition?.side === "long") return left.price - right.price;
      return right.price - left.price;
    });

    const activeTargets = targets.filter((target) => {
      return !activePosition?.fills.some(
        (fill) => fill.reason === "tp" && fill.price === target.price,
      );
    });

    const processTargets = () => {
      if (!activePosition) return;
      for (const target of activeTargets) {
        if (!targetTouched(activePosition.side, candle, target.price)) continue;
        const qty = activePosition.quantity * target.sizeFraction;
        closePortion(candle, target.id, qty, target.price);
        if (!activePosition) return;
        if (target.moveStopToBreakeven) {
          activePosition.stopPrice = activePosition.entryPrice;
          timeline.push({
            time: candle.time,
            type: "stop.moved",
            positionId: activePosition.positionId,
            message: `Stop moved to breakeven after ${target.label}`,
            data: { stopPrice: activePosition.stopPrice },
          });
        }
      }
    };

    const processStop = () => {
      if (!activePosition || activePosition.stopPrice === undefined) return;
      if (stopTouched(activePosition.side, candle, activePosition.stopPrice)) {
        closePortion(
          candle,
          "stop",
          activePosition.remainingQuantity,
          activePosition.stopPrice,
        );
      }
    };

    if (
      (input.bot.metadata?.intrabarExitPriority as string | undefined) ===
      "target-first"
    ) {
      processTargets();
      if (activePosition) processStop();
    } else {
      processStop();
      if (activePosition) processTargets();
    }

    if (!activePosition) return;

    const closeIntent = decision.intents.find(
      (intent): intent is Extract<TradingIntent<TMeta>, { kind: "close" }> => {
        return intent.kind === "close" && intent.side === activePosition?.side;
      },
    );

    if (closeIntent) {
      closePortion(
        candle,
        "signal",
        activePosition.remainingQuantity,
        closeIntent.price ?? candle.close,
      );
      return;
    }

    if (!activePosition || !management?.closeOnOppositeIntent) return;

    const oppositeEnter = decision.intents.find(
      (intent): intent is EnterPositionIntent<TMeta> => {
        return intent.kind === "enter" && intent.side !== activePosition?.side;
      },
    );

    if (oppositeEnter) {
      closePortion(
        candle,
        "signal",
        activePosition.remainingQuantity,
        candle.close,
      );
    }
  };

  for (let index = 0; index < executionCandles.length; index += 1) {
    const candle = executionCandles[index];
    if (!candle) continue;

    const market = {
      executionCandles,
      index,
      series: input.market.series,
    };

    const snapshot = input.strategy.buildSnapshot({
      bot: input.bot,
      config: input.config,
      market,
      position: activePosition,
    });

    const decision = input.strategy.evaluate({
      bot: input.bot,
      config: input.config,
      snapshot,
      market,
      position: activePosition,
    });

    timeline.push({
      time: candle.time,
      type: "strategy.decision",
      positionId: activePosition?.positionId,
      message: decision.reasons.join(", ") || "strategy_evaluated",
      data: decision.diagnostics,
    });

    if (activePosition) {
      const cooldownBars = activePosition.management?.cooldownBars ?? 0;
      processManagementPlan(candle, activePosition.management, decision);
      if (!activePosition) {
        cooldownUntilIndex = index + cooldownBars + 1;
      } else if (activePosition.status === "reducing") {
        activePosition.status = "open";
      }
    }

    if (!activePosition && index >= cooldownUntilIndex) {
      const enterIntent = decision.intents.find(
        (intent): intent is EnterPositionIntent<TMeta> =>
          intent.kind === "enter",
      );
      if (enterIntent) {
        const sizing = input.positionSizer({
          bot: input.bot,
          config: input.config,
          snapshot,
          decision,
          intent: enterIntent,
          candle,
          equity,
        });

        if (sizing.quantity > 0) {
          const entryPrice = applySlippage(
            enterIntent.entry.price ?? candle.close,
            enterIntent.side,
            "entry",
            slippageBps,
          );
          const entryFee = feeFor(entryPrice, sizing.quantity, feeRate);
          equity -= entryFee;

          const positionId = `position-${nextPositionId++}`;
          const orderId = `order-${nextOrderId++}`;
          const fillId = `fill-${nextFillId++}`;

          const order: SimulatedOrder = {
            id: orderId,
            botId: input.bot.id,
            positionId,
            side: enterIntent.side,
            purpose: "entry",
            status: "filled",
            requestedPrice: enterIntent.entry.price ?? candle.close,
            executedPrice: entryPrice,
            requestedQuantity: sizing.quantity,
            executedQuantity: sizing.quantity,
            createdAtMs: candle.time,
            updatedAtMs: candle.time,
          };
          orders.push(order);

          const fill: SimulatedFill = {
            id: fillId,
            orderId,
            positionId,
            botId: input.bot.id,
            reason: "entry",
            side: enterIntent.side,
            time: candle.time,
            price: entryPrice,
            quantity: sizing.quantity,
            grossPnl: 0,
            fee: entryFee,
            netPnl: -entryFee,
          };
          fills.push(fill);

          activePosition = {
            botId: input.bot.id,
            positionId,
            symbol: input.bot.symbol,
            side: enterIntent.side,
            status: "open",
            quantity: sizing.quantity,
            remainingQuantity: sizing.quantity,
            avgEntryPrice: entryPrice,
            entryPrice,
            stopPrice: enterIntent.risk.stopPrice,
            realizedPnl: 0,
            openedAtMs: candle.time,
            entryFee,
            fills: [fill],
            management: enterIntent.management,
            strategyContext: {
              reasons: enterIntent.reasons,
              sizing,
            },
            meta: enterIntent.meta,
          };

          timeline.push({
            time: candle.time,
            type: "position.opened",
            positionId,
            message: `Position opened ${enterIntent.side}`,
            data: { quantity: sizing.quantity, entryPrice },
          });
        }
      }
    }

    equityCurve.push({
      time: candle.time,
      equity,
    });
  }

  const lastCandle = executionCandles[executionCandles.length - 1];
  if (activePosition && lastCandle) {
    closePortion(
      lastCandle,
      "end",
      activePosition.remainingQuantity,
      lastCandle.close,
    );
    if (equityCurve.length > 0) {
      equityCurve[equityCurve.length - 1] = {
        time: lastCandle.time,
        equity,
      };
    }
  }

  const maxDrawdownPct = computeMaxDrawdownPct(equityCurve);
  const metrics = buildMetrics(positions, equity, maxDrawdownPct);

  return {
    botId: input.bot.id,
    strategyId: input.strategy.id,
    metrics,
    positions,
    orders,
    fills,
    equityCurve,
    timeline,
  };
}
