import type {
  BotAnalysisSummary,
  BotOperationalStats,
  BotRecord,
  BotRunRecord,
  TradeSignalRecord,
} from "./types";
import { encodeTradeId } from "./trades";

export function computeDashboardMetrics(
  runs: BotRunRecord[],
): BotOperationalStats {
  let noSignalRuns = 0;
  let longSignals = 0;
  let shortSignals = 0;
  let orderSubmitted = 0;
  let dryRunSignals = 0;
  let skippedSignals = 0;
  let failedRuns = 0;

  for (const run of runs) {
    if (run.runStatus === "failed" || run.processing.status === "error") {
      failedRuns += 1;
    }

    if (!run.signal) {
      noSignalRuns += 1;
    } else if (run.signal === "long") {
      longSignals += 1;
    } else if (run.signal === "short") {
      shortSignals += 1;
    }

    if (run.processing.status === "order-submitted") {
      orderSubmitted += 1;
    } else if (run.processing.status === "dry-run") {
      dryRunSignals += 1;
    } else if (run.processing.status === "skipped-existing-position") {
      skippedSignals += 1;
    }
  }

  const totalRuns = runs.length;
  const signalRuns = longSignals + shortSignals;

  return {
    totalRuns,
    noSignalRuns,
    signalRuns,
    longSignals,
    shortSignals,
    orderSubmitted,
    dryRunSignals,
    skippedSignals,
    failedRuns,
    signalRate: totalRuns > 0 ? signalRuns / totalRuns : 0,
    failureRate: totalRuns > 0 ? failedRuns / totalRuns : 0,
  };
}

export function mapRunsToTrades(runs: BotRunRecord[]): TradeSignalRecord[] {
  return runs
    .filter((run) => run.signal === "long" || run.signal === "short")
    .map((run) => ({
      id: encodeTradeId(run.symbol, run.generatedAtMs),
      botId: run.botId,
      symbol: run.symbol,
      side: run.signal as "long" | "short",
      generatedAtMs: run.generatedAtMs,
      price: run.price,
      processingStatus: run.processing.status,
      orderId: run.processing.orderId,
      clientOid: run.processing.clientOid,
      reasons: run.reasons,
    }))
    .sort((a, b) => b.generatedAtMs - a.generatedAtMs);
}

export function buildBotSummaries(
  bots: BotRecord[],
  latestRuns: BotRunRecord[],
): BotAnalysisSummary[] {
  const byBotId = new Map<string, BotRunRecord>();
  for (const run of latestRuns) {
    byBotId.set(run.botId, run);
  }

  return bots.map((bot) => {
    const run = byBotId.get(bot.id);

    if (!run) {
      return {
        botId: bot.id,
        botName: bot.name,
        strategyId: bot.strategyId,
        strategyVersion: bot.strategyVersion,
        exchangeId: bot.exchangeId,
        accountId: bot.accountId,
        symbol: bot.symbol,
        signal: null,
        runStatus: "idle",
        reasons: ["no_analysis_yet"],
        processingStatus: "idle",
      };
    }

    return {
      botId: bot.id,
      botName: bot.name,
      strategyId: bot.strategyId,
      strategyVersion: bot.strategyVersion,
      exchangeId: bot.exchangeId,
      accountId: bot.accountId,
      symbol: bot.symbol,
      generatedAtMs: run.generatedAtMs,
      signal: run.signal,
      runStatus: run.runStatus,
      reasons: run.reasons,
      price: run.price,
      rangeVal: run.rangeVal,
      rangeVah: run.rangeVah,
      rangePoc: run.rangePoc,
      rangeIsAligned: run.rangeIsAligned,
      moneyFlowSlope: run.moneyFlowSlope,
      bullishDivergence: run.bullishDivergence,
      bearishDivergence: run.bearishDivergence,
      bullishSfp: run.bullishSfp,
      bearishSfp: run.bearishSfp,
      processingStatus: run.processing.status,
      processingMessage: run.processing.message,
      orderId: run.processing.orderId,
    };
  });
}
