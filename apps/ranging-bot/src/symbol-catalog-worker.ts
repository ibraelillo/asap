import type { ScheduledEvent } from "aws-lambda";
import { refreshActiveExchangeSymbolCatalogs } from "./symbol-catalog";

export async function handler(event: ScheduledEvent) {
  const result = await refreshActiveExchangeSymbolCatalogs();
  console.info("[symbol-catalog-worker] refresh completed", {
    trigger: event["detail-type"] ?? "scheduled",
    refreshed: result.refreshed,
    skipped: result.skipped,
  });

  return {
    ok: true,
    refreshed: result.refreshed,
    skipped: result.skipped,
  };
}
