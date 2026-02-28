import { expect, type Page, type Route } from "@playwright/test";

export const BOT_ID = "kucoin-main-range-reversal-suiusdtm";
export const STRATEGY_ID = "range-reversal";
export const ACCOUNT_ID = "kucoin-main";
export const BACKTEST_ID = "bt-sui-20260227";
export const TRADE_ID = "trade-sui-long-1";

const NOW = Date.parse("2026-02-27T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function createCandles(
  startMs: number,
  count: number,
  stepMs: number,
  startPrice: number,
) {
  return Array.from({ length: count }, (_, index) => {
    const time = startMs + index * stepMs;
    const wave = Math.sin(index / 2) * 1.6;
    const drift = index * 0.22;
    const open = startPrice + drift + wave;
    const close = open + (index % 2 === 0 ? 0.7 : -0.35);
    const high = Math.max(open, close) + 0.9;
    const low = Math.min(open, close) - 0.8;
    return {
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number((1200 + index * 35).toFixed(2)),
    };
  });
}

const backtestCandles = createCandles(NOW - 18 * HOUR_MS, 24, HOUR_MS, 78);
const analysisCandles = createCandles(
  NOW - 6 * HOUR_MS,
  32,
  FIFTEEN_MIN_MS,
  79,
);

const botSummary = {
  botId: BOT_ID,
  botName: "SUI Range Reversal",
  strategyId: STRATEGY_ID,
  strategyVersion: "1",
  exchangeId: "kucoin",
  accountId: ACCOUNT_ID,
  status: "active",
  symbol: "SUIUSDTM",
  generatedAtMs: NOW,
  signal: "long",
  runStatus: "ok",
  reasons: ["range_aligned", "bullish_divergence", "bullish_sfp"],
  price: 82.45,
  rangeVal: 79.2,
  rangeVah: 88.8,
  rangePoc: 84.1,
  rangeIsAligned: true,
  moneyFlowSlope: 0.1842,
  bullishDivergence: true,
  bearishDivergence: false,
  bullishSfp: true,
  bearishSfp: false,
  processingStatus: "order-submitted",
  processingMessage: "Entry routed to exchange",
  orderId: "ord-123",
};

const botRecord = {
  id: BOT_ID,
  name: "SUI Range Reversal",
  strategyId: STRATEGY_ID,
  strategyVersion: "1",
  exchangeId: "kucoin",
  accountId: ACCOUNT_ID,
  symbol: "SUIUSDTM",
  status: "active",
  runtime: {
    executionTimeframe: "1h",
    executionLimit: 240,
    primaryRangeTimeframe: "1d",
    primaryRangeLimit: 90,
    secondaryRangeTimeframe: "4h",
    secondaryRangeLimit: 180,
    dryRun: true,
    marginMode: "CROSS",
    valueQty: "100",
  },
  createdAtMs: NOW - 14 * HOUR_MS,
  updatedAtMs: NOW - HOUR_MS,
};

const runs = [
  {
    id: "run-2",
    botId: BOT_ID,
    botName: "SUI Range Reversal",
    strategyId: STRATEGY_ID,
    strategyVersion: "1",
    exchangeId: "kucoin",
    accountId: ACCOUNT_ID,
    symbol: "SUIUSDTM",
    generatedAtMs: NOW - HOUR_MS,
    recordedAtMs: NOW - HOUR_MS + 1500,
    latencyMs: 1500,
    runStatus: "ok",
    executionTimeframe: "1h",
    primaryRangeTimeframe: "1d",
    secondaryRangeTimeframe: "4h",
    signal: "long",
    reasons: ["range_aligned", "bullish_divergence", "bullish_sfp"],
    price: 82.45,
    rangeVal: 79.2,
    rangeVah: 88.8,
    rangePoc: 84.1,
    rangeIsAligned: true,
    rangeOverlapRatio: 0.82,
    bullishDivergence: true,
    bearishDivergence: false,
    bullishSfp: true,
    bearishSfp: false,
    moneyFlowSlope: 0.1842,
    positionStatusBefore: "flat",
    positionStatusAfter: "entry-pending",
    exchangeReconciliationStatus: "ok",
    processing: {
      status: "order-submitted",
      side: "long",
      message: "Entry order accepted",
      orderId: "ord-123",
      clientOid: "client-123",
      positionSnapshot: null,
    },
  },
  {
    id: "run-1",
    botId: BOT_ID,
    botName: "SUI Range Reversal",
    strategyId: STRATEGY_ID,
    strategyVersion: "1",
    exchangeId: "kucoin",
    accountId: ACCOUNT_ID,
    symbol: "SUIUSDTM",
    generatedAtMs: NOW - 2 * HOUR_MS,
    recordedAtMs: NOW - 2 * HOUR_MS + 1200,
    latencyMs: 1200,
    runStatus: "ok",
    executionTimeframe: "1h",
    primaryRangeTimeframe: "1d",
    secondaryRangeTimeframe: "4h",
    signal: null,
    reasons: ["price_not_below_val", "missing_bullish_divergence"],
    price: 83.1,
    rangeVal: 79.2,
    rangeVah: 88.8,
    rangePoc: 84.1,
    rangeIsAligned: true,
    rangeOverlapRatio: 0.82,
    bullishDivergence: false,
    bearishDivergence: false,
    bullishSfp: false,
    bearishSfp: false,
    moneyFlowSlope: 0.041,
    positionStatusBefore: "flat",
    positionStatusAfter: "flat",
    exchangeReconciliationStatus: "ok",
    processing: {
      status: "no-signal",
      message: "No qualifying setup",
      positionSnapshot: null,
    },
  },
];

const trades = [
  {
    id: TRADE_ID,
    botId: BOT_ID,
    symbol: "SUIUSDTM",
    side: "long",
    generatedAtMs: NOW - HOUR_MS,
    price: 82.45,
    processingStatus: "order-submitted",
    orderId: "ord-123",
    clientOid: "client-123",
    reasons: ["range_aligned", "bullish_divergence", "bullish_sfp"],
  },
];

const dashboard = {
  generatedAt: iso(NOW),
  metrics: {
    totalRuns: 14,
    failedRuns: 1,
    signalRuns: 4,
    longSignals: 3,
    shortSignals: 1,
    noSignalRuns: 10,
    orderSubmitted: 2,
    dryRunSignals: 1,
    skippedSignals: 1,
    signalRate: 4 / 14,
    failureRate: 1 / 14,
  },
  bots: [botSummary],
  recentRuns: runs,
  trades,
};

const stats = {
  generatedAt: iso(NOW),
  bot: {
    configured: 1,
    active: 1,
  },
  operations: dashboard.metrics,
  strategy: {
    netPnl: 134.6,
    grossProfit: 182.3,
    grossLoss: -47.7,
    winRate: 0.64,
    totalTrades: 11,
    profitableBacktests: 3,
    latestNetPnl: 34.8,
    maxDrawdownPct: 0.08,
  },
  positions: {
    openPositions: 1,
    reducingPositions: 0,
    closingPositions: 0,
    reconciliationsPending: 0,
    forcedCloseCount: 0,
    breakevenMoves: 2,
  },
  backtests: {
    total: 2,
    running: 1,
    completed: 1,
    failed: 0,
    profitable: 1,
    latestNetPnl: 34.8,
  },
};

const initialAccount = {
  id: ACCOUNT_ID,
  name: "main-kucoin",
  exchangeId: "kucoin",
  status: "active",
  createdAtMs: NOW - 14 * HOUR_MS,
  updatedAtMs: NOW - HOUR_MS,
  hasAuth: {
    apiKey: true,
    apiSecret: true,
    apiPassphrase: true,
  },
  balance: {
    currency: "USDT",
    available: 812.4,
    total: 1043.75,
    fetchedAtMs: NOW,
  },
};

const position = {
  id: "pos-sui-1",
  botId: BOT_ID,
  botName: "SUI Range Reversal",
  strategyId: STRATEGY_ID,
  strategyVersion: "1",
  exchangeId: "kucoin",
  accountId: ACCOUNT_ID,
  symbol: "SUIUSDTM",
  side: "long",
  status: "open",
  quantity: 12.5,
  remainingQuantity: 6.25,
  avgEntryPrice: 82.45,
  stopPrice: 79.05,
  realizedPnl: 18.2,
  unrealizedPnl: 9.4,
  openedAtMs: NOW - 90 * 60 * 1000,
  lastStrategyDecisionTimeMs: NOW - HOUR_MS,
  lastExchangeSyncTimeMs: NOW - 10 * 60 * 1000,
};

const orders = [
  {
    id: "client-123",
    botId: BOT_ID,
    positionId: position.id,
    symbol: "SUIUSDTM",
    side: "long",
    purpose: "entry",
    status: "filled",
    requestedValueQty: "150",
    executedQuantity: 12.5,
    executedPrice: 82.45,
    externalOrderId: "ord-123",
    clientOid: "client-123",
    createdAtMs: NOW - HOUR_MS,
    updatedAtMs: NOW - HOUR_MS,
  },
];

const fills = [
  {
    id: "client-123-fill",
    botId: BOT_ID,
    positionId: position.id,
    orderId: "client-123",
    symbol: "SUIUSDTM",
    side: "long",
    reason: "entry",
    source: "exchange-snapshot",
    price: 82.45,
    quantity: 12.5,
    createdAtMs: NOW - HOUR_MS,
  },
];

const reconciliations = [
  {
    id: "recon-1",
    botId: BOT_ID,
    positionId: position.id,
    symbol: "SUIUSDTM",
    status: "ok",
    message: "entry_confirmed",
    createdAtMs: NOW - HOUR_MS,
  },
];

const completedBacktest = {
  id: BACKTEST_ID,
  createdAtMs: NOW - 3 * HOUR_MS,
  status: "completed",
  botId: BOT_ID,
  botName: "SUI Range Reversal",
  strategyId: STRATEGY_ID,
  strategyVersion: "1",
  exchangeId: "kucoin",
  accountId: ACCOUNT_ID,
  symbol: "SUIUSDTM",
  fromMs: NOW - 30 * 24 * HOUR_MS,
  toMs: NOW,
  executionTimeframe: "1h",
  primaryRangeTimeframe: "1d",
  secondaryRangeTimeframe: "4h",
  initialEquity: 1000,
  totalTrades: 1,
  wins: 1,
  losses: 0,
  winRate: 1,
  netPnl: 34.78,
  grossProfit: 39.12,
  grossLoss: 0,
  maxDrawdownPct: 0.04,
  endingEquity: 1034.78,
  ai: {
    enabled: true,
    lookbackCandles: 240,
    cadenceBars: 1,
    maxEvaluations: 50,
    confidenceThreshold: 0.72,
    modelPrimary: "gpt-5-nano",
    modelFallback: "gpt-4.1-mini",
    effectiveCadenceBars: 1,
    plannedEvaluations: 4,
    evaluationsRun: 4,
    evaluationsAccepted: 3,
    fallbackUsed: 0,
    failed: 0,
  },
};

const runningBacktest = {
  id: "bt-sui-running",
  createdAtMs: NOW - 30 * 60 * 1000,
  status: "running",
  botId: BOT_ID,
  botName: "SUI Range Reversal",
  strategyId: STRATEGY_ID,
  strategyVersion: "1",
  exchangeId: "kucoin",
  accountId: ACCOUNT_ID,
  symbol: "SUIUSDTM",
  fromMs: NOW - 14 * 24 * HOUR_MS,
  toMs: NOW,
  executionTimeframe: "1h",
  primaryRangeTimeframe: "1d",
  secondaryRangeTimeframe: "4h",
  initialEquity: 1000,
  totalTrades: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  netPnl: 0,
  grossProfit: 0,
  grossLoss: 0,
  maxDrawdownPct: 0,
  endingEquity: 1000,
  ai: {
    enabled: true,
    lookbackCandles: 240,
    cadenceBars: 1,
    maxEvaluations: 50,
    confidenceThreshold: 0.72,
    modelPrimary: "gpt-5-nano",
    modelFallback: "gpt-4.1-mini",
    effectiveCadenceBars: 1,
    plannedEvaluations: 6,
    evaluationsRun: 2,
    evaluationsAccepted: 1,
    fallbackUsed: 0,
    failed: 0,
  },
};

const validations = [
  {
    id: "validation-completed",
    botId: BOT_ID,
    botName: "SUI Range Reversal",
    strategyId: STRATEGY_ID,
    createdAtMs: NOW - 50 * 60 * 1000,
    status: "completed",
    symbol: "SUIUSDTM",
    timeframe: "4h",
    fromMs: NOW - 14 * 24 * HOUR_MS,
    toMs: NOW,
    candlesCount: 240,
    modelPrimary: "gpt-5-nano",
    modelFallback: "gpt-4.1-mini",
    finalModel: "gpt-5-nano",
    confidenceThreshold: 0.72,
    result: {
      isRanging: true,
      confidence: 0.84,
      timeframeDetected: "4h",
      range: {
        val: 79.2,
        poc: 84.1,
        vah: 88.8,
      },
      reasons: ["value-area stable", "repeated acceptance around poc"],
    },
  },
  {
    id: "validation-pending",
    botId: BOT_ID,
    botName: "SUI Range Reversal",
    strategyId: STRATEGY_ID,
    createdAtMs: NOW - 10 * 60 * 1000,
    status: "pending",
    symbol: "SUIUSDTM",
    timeframe: "2h",
    fromMs: NOW - 7 * 24 * HOUR_MS,
    toMs: NOW,
    candlesCount: 180,
    modelPrimary: "gpt-5-nano",
    modelFallback: "gpt-4.1-mini",
    confidenceThreshold: 0.72,
  },
];

const strategies = [
  {
    strategyId: STRATEGY_ID,
    label: "Range Reversal",
    description:
      "Daily + 4h aligned value-area reversal strategy with divergence, money flow, and SFP confirmation.",
    manifestVersion: "1",
    configuredVersions: ["1"],
    configuredBots: 1,
    activeBots: 1,
    symbols: ["SUIUSDTM"],
    operations: dashboard.metrics,
    strategy: stats.strategy,
    positions: stats.positions,
    backtests: stats.backtests,
  },
  {
    strategyId: "indicator-bot",
    label: "Indicator Bot",
    description:
      "Scaffold strategy for future indicator confluence systems. Currently hold-only.",
    manifestVersion: "1",
    configuredVersions: [],
    configuredBots: 0,
    activeBots: 0,
    symbols: [],
    operations: {
      totalRuns: 0,
      failedRuns: 0,
      signalRuns: 0,
      longSignals: 0,
      shortSignals: 0,
      noSignalRuns: 0,
      orderSubmitted: 0,
      dryRunSignals: 0,
      skippedSignals: 0,
      signalRate: 0,
      failureRate: 0,
    },
    strategy: {
      netPnl: 0,
      grossProfit: 0,
      grossLoss: 0,
      winRate: 0,
      totalTrades: 0,
      profitableBacktests: 0,
    },
    positions: {
      openPositions: 0,
      reducingPositions: 0,
      closingPositions: 0,
      reconciliationsPending: 0,
      forcedCloseCount: 0,
      breakevenMoves: 0,
    },
    backtests: {
      total: 0,
      running: 0,
      completed: 0,
      failed: 0,
      profitable: 0,
    },
  },
];

const strategyDetails = {
  generatedAt: iso(NOW),
  strategy: strategies[0],
  bots: [botSummary],
  recentRuns: runs,
};

const backtestDetailsBase = {
  generatedAt: iso(NOW),
  backtest: completedBacktest,
  candles: backtestCandles,
  trades: [
    {
      id: 1,
      side: "long",
      entryTime: NOW - 12 * HOUR_MS,
      entryPrice: 80.1,
      stopPriceAtEntry: 78.4,
      quantity: 8.13638,
      entryFee: 0.65,
      exits: [
        {
          reason: "tp1",
          time: NOW - 8 * HOUR_MS,
          price: 84.1,
          quantity: 4.06819,
          grossPnl: 16.27,
          fee: 0.23,
          netPnl: 16.04,
        },
        {
          reason: "tp2",
          time: NOW - 6 * HOUR_MS,
          price: 88.8,
          quantity: 4.06819,
          grossPnl: 19.28,
          fee: 0.54,
          netPnl: 18.74,
        },
      ],
      closeTime: NOW - 6 * HOUR_MS,
      closePrice: 88.8,
      grossPnl: 35.55,
      fees: 0.77,
      netPnl: 34.78,
      rangeLevels: {
        val: 79.2,
        poc: 84.1,
        vah: 88.8,
      },
    },
  ],
  equityCurve: [
    { time: NOW - 13 * HOUR_MS, equity: 1000 },
    { time: NOW - 8 * HOUR_MS, equity: 1016.04 },
    { time: NOW - 6 * HOUR_MS, equity: 1034.78 },
  ],
};

const tradeAnalysis = {
  generatedAt: iso(NOW),
  trade: trades[0],
  run: runs[0],
  timeframe: "15m",
  barsBefore: 80,
  barsAfter: 80,
  klines: analysisCandles,
};

export async function mockRangingApi(page: Page) {
  let accounts = [{ ...initialAccount }];
  let bot = { ...botRecord };

  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (method === "GET" && pathname === "/v1/ranging/dashboard") {
      return json(route, dashboard);
    }

    if (method === "GET" && pathname === "/v1/strategies") {
      return json(route, { strategies });
    }

    if (method === "GET" && pathname === `/v1/strategies/${STRATEGY_ID}`) {
      return json(route, strategyDetails);
    }

    if (method === "GET" && pathname === "/v1/bots") {
      return json(route, { bots: [botSummary] });
    }

    if (method === "POST" && pathname === "/v1/bots") {
      return json(route, {
        generatedAt: iso(NOW),
        bot,
      });
    }

    if (method === "PATCH" && pathname === `/v1/bots/${BOT_ID}`) {
      const body = JSON.parse(request.postData() ?? "{}") as {
        status?: "active" | "paused" | "archived";
      };
      bot = {
        ...bot,
        status: body.status ?? bot.status,
      };
      return json(route, {
        generatedAt: iso(NOW),
        bot,
      });
    }

    if (method === "GET" && pathname === "/v1/accounts") {
      return json(route, { accounts });
    }

    if (method === "POST" && pathname === "/v1/accounts") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        name?: string;
        exchangeId?: string;
      };
      const createdAccount = {
        id: `${body.exchangeId ?? "kucoin"}-${String(body.name ?? "new-account")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")}`,
        name: body.name ?? "new-account",
        exchangeId: body.exchangeId ?? "kucoin",
        status: "active",
        createdAtMs: NOW,
        updatedAtMs: NOW,
        hasAuth: {
          apiKey: true,
          apiSecret: true,
          apiPassphrase: body.exchangeId === "kucoin",
        },
        balance: {
          currency: "USDT",
          available: 0,
          total: 0,
          fetchedAtMs: NOW,
        },
      };
      accounts = [...accounts, createdAccount];
      return json(route, {
        generatedAt: iso(NOW),
        account: createdAccount,
      });
    }

    if (method === "PATCH" && pathname.startsWith("/v1/accounts/")) {
      const accountId = decodeURIComponent(pathname.split("/").pop() ?? "");
      const body = JSON.parse(request.postData() ?? "{}") as {
        status?: "active" | "archived";
        auth?: {
          apiKey?: string;
          apiSecret?: string;
          apiPassphrase?: string;
        };
      };
      accounts = accounts.map((account) =>
        account.id === accountId
          ? {
              ...account,
              status: body.status ?? account.status,
              updatedAtMs: NOW,
              hasAuth: {
                apiKey: body.auth?.apiKey ? true : account.hasAuth.apiKey,
                apiSecret: body.auth?.apiSecret
                  ? true
                  : account.hasAuth.apiSecret,
                apiPassphrase:
                  body.auth?.apiPassphrase !== undefined
                    ? body.auth.apiPassphrase.trim().length > 0
                    : account.hasAuth.apiPassphrase,
              },
            }
          : account,
      );
      const updatedAccount =
        accounts.find((account) => account.id === accountId) ?? accounts[0];
      return json(route, {
        generatedAt: iso(NOW),
        account: updatedAccount,
      });
    }

    if (method === "GET" && pathname === `/v1/bots/${BOT_ID}`) {
      return json(route, {
        bot,
        summary: botSummary,
        openPosition: position,
        backtests: [runningBacktest, completedBacktest],
        validations,
      });
    }

    if (method === "GET" && pathname === `/v1/bots/${BOT_ID}/stats`) {
      return json(route, stats);
    }

    if (method === "GET" && pathname === `/v1/bots/${BOT_ID}/positions`) {
      return json(route, {
        generatedAt: iso(NOW),
        count: 1,
        positions: [position],
        orders,
        fills,
        reconciliations,
      });
    }

    if (method === "GET" && pathname === `/v1/bots/${BOT_ID}/backtests`) {
      return json(route, { backtests: [runningBacktest, completedBacktest] });
    }

    if (method === "POST" && pathname === `/v1/bots/${BOT_ID}/backtests`) {
      return json(route, {
        backtest: {
          ...runningBacktest,
          createdAtMs: NOW,
        },
      });
    }

    if (method === "GET" && pathname === `/v1/bots/${BOT_ID}/validations`) {
      return json(route, { validations });
    }

    if (method === "POST" && pathname === `/v1/bots/${BOT_ID}/validations`) {
      return json(route, {
        validation: {
          ...validations[1],
          createdAtMs: NOW,
        },
      });
    }

    if (method === "GET" && pathname === "/v1/ranging/runs") {
      return json(route, { runs });
    }

    if (method === "GET" && pathname === `/v1/backtests/${BACKTEST_ID}`) {
      const chartTimeframe = url.searchParams.get("chartTimeframe") ?? "4h";
      return json(route, {
        ...backtestDetailsBase,
        chartTimeframe,
      });
    }

    if (method === "GET" && pathname === `/v1/ranging/trades/${TRADE_ID}`) {
      return json(route, tradeAnalysis);
    }

    return json(
      route,
      {
        error: `Unhandled mocked API route: ${method} ${pathname}`,
      },
      500,
    );
  });
}

export function attachBrowserErrorGuards(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    errors.push(`console.error: ${message.text()}`);
  });

  return async () => {
    expect(errors, errors.join("\n")).toEqual([]);
  };
}
