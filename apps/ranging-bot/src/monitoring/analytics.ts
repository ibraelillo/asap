import type {
  BotAnalysisSummary,
  BotRunRecord,
  DashboardMetrics,
  TradeSignalRecord,
} from "./types";
import { encodeTradeId } from "./trades";

export function computeDashboardMetrics(runs: BotRunRecord[]): DashboardMetrics {
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

  return {
    totalRuns: runs.length,
    noSignalRuns,
    signalRuns: longSignals + shortSignals,
    longSignals,
    shortSignals,
    orderSubmitted,
    dryRunSignals,
    skippedSignals,
    failedRuns,
  };
}

export function mapRunsToTrades(runs: BotRunRecord[]): TradeSignalRecord[] {
  return runs
    .filter((run) => run.signal === "long" || run.signal === "short")
    .map((run) => ({
      id: encodeTradeId(run.symbol, run.generatedAtMs),
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
  symbols: string[],
  latestRuns: BotRunRecord[],
): BotAnalysisSummary[] {
  const bySymbol = new Map<string, BotRunRecord>();
  for (const run of latestRuns) {
    bySymbol.set(run.symbol, run);
  }

  return symbols.map((symbol) => {
    const run = bySymbol.get(symbol);

    if (!run) {
      return {
        symbol,
        signal: null,
        runStatus: "idle",
        reasons: ["no_analysis_yet"],
        processingStatus: "idle",
      };
    }

    return {
      symbol,
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
