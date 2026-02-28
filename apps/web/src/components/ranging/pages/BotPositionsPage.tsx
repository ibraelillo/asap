import useSWR from "swr";
import { Link, Navigate, useParams } from "react-router-dom";
import { fetchBotDetails, fetchBotPositions } from "../../../lib/ranging-api";
import { SectionHeader, formatDateTime } from "../BotUi";

export function BotPositionsPage() {
  const { botId } = useParams<{ botId: string }>();
  const { data: details } = useSWR(
    botId ? ["bot-details", botId] : null,
    ([, id]) => fetchBotDetails(String(id)),
    { revalidateOnFocus: false },
  );
  const {
    data: positions,
    error,
    isLoading,
  } = useSWR(
    botId ? ["bot-positions-page", botId] : null,
    ([, id]) => fetchBotPositions(String(id)),
    { refreshInterval: 20_000, revalidateOnFocus: false },
  );

  if (!botId) {
    return <Navigate to="/bots" replace />;
  }

  if (!positions && isLoading) {
    return (
      <div className="panel p-6 text-sm text-slate-300">
        Loading positions...
      </div>
    );
  }

  if (!positions || error) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-rose-300">Failed to load positions.</p>
        <p className="mt-2 text-xs text-slate-400 mono">
          {error instanceof Error ? error.message : "Unknown API error"}
        </p>
      </div>
    );
  }

  const symbol =
    details?.summary && "symbol" in details.summary
      ? details.summary.symbol
      : botId;

  return (
    <div className="space-y-6">
      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
              Bot Positions
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {symbol}
            </h1>
            <p className="mt-2 text-sm text-slate-300/90">
              Persisted position ledger and exchange reconciliation view for
              this bot.
            </p>
          </div>
          <Link
            to={`/bots/${encodeURIComponent(botId)}`}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
          >
            Back To Bot
          </Link>
        </div>
      </header>

      <section className="panel p-5">
        <SectionHeader
          title="Positions"
          description="Local position records, not just exchange snapshots."
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">ID</th>
                <th className="pb-3 pr-4">Side</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Qty</th>
                <th className="pb-3 pr-4">Remaining</th>
                <th className="pb-3 pr-4">Avg Entry</th>
                <th className="pb-3 pr-4">Stop</th>
                <th className="pb-3 pr-4">Opened</th>
                <th className="pb-3">Synced</th>
              </tr>
            </thead>
            <tbody>
              {positions.positions.map((position) => (
                <tr
                  key={position.id}
                  className="border-t border-white/5 text-slate-200"
                >
                  <td className="py-3 pr-4 text-xs text-slate-300 mono">
                    {position.id}
                  </td>
                  <td className="py-3 pr-4">{position.side}</td>
                  <td className="py-3 pr-4">{position.status}</td>
                  <td className="py-3 pr-4">{position.quantity}</td>
                  <td className="py-3 pr-4">{position.remainingQuantity}</td>
                  <td className="py-3 pr-4">
                    {position.avgEntryPrice?.toLocaleString() ?? "-"}
                  </td>
                  <td className="py-3 pr-4">
                    {position.stopPrice?.toLocaleString() ?? "-"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    {formatDateTime(position.openedAtMs)}
                  </td>
                  <td className="py-3 text-xs text-slate-300">
                    {formatDateTime(position.lastExchangeSyncTimeMs)}
                  </td>
                </tr>
              ))}
              {positions.positions.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-4 text-center text-xs text-slate-400"
                  >
                    No position records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="panel p-5">
          <SectionHeader
            title="Orders"
            description="Persisted execution acknowledgements keyed by bot."
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Purpose</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Side</th>
                  <th className="pb-3 pr-4">Req Qty</th>
                  <th className="pb-3 pr-4">Req Value</th>
                  <th className="pb-3">Exec Qty</th>
                </tr>
              </thead>
              <tbody>
                {positions.orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-t border-white/5 text-slate-200"
                  >
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {formatDateTime(order.createdAtMs)}
                    </td>
                    <td className="py-3 pr-4">{order.purpose}</td>
                    <td className="py-3 pr-4">{order.status}</td>
                    <td className="py-3 pr-4">{order.side}</td>
                    <td className="py-3 pr-4">
                      {order.requestedQuantity?.toLocaleString() ?? "-"}
                    </td>
                    <td className="py-3 pr-4">
                      {order.requestedValueQty ?? "-"}
                    </td>
                    <td className="py-3">
                      {order.executedQuantity?.toLocaleString() ?? "-"}
                    </td>
                  </tr>
                ))}
                {positions.orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-4 text-center text-xs text-slate-400"
                    >
                      No order records yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel p-5">
          <SectionHeader
            title="Fills"
            description="Only confirmed fills are persisted here."
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Reason</th>
                  <th className="pb-3 pr-4">Side</th>
                  <th className="pb-3 pr-4">Qty</th>
                  <th className="pb-3">Price</th>
                </tr>
              </thead>
              <tbody>
                {positions.fills.map((fill) => (
                  <tr
                    key={fill.id}
                    className="border-t border-white/5 text-slate-200"
                  >
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {formatDateTime(fill.createdAtMs)}
                    </td>
                    <td className="py-3 pr-4">{fill.reason}</td>
                    <td className="py-3 pr-4">{fill.side}</td>
                    <td className="py-3 pr-4">
                      {fill.quantity.toLocaleString()}
                    </td>
                    <td className="py-3">
                      {fill.price?.toLocaleString() ?? "-"}
                    </td>
                  </tr>
                ))}
                {positions.fills.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-4 text-center text-xs text-slate-400"
                    >
                      No fill records yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <SectionHeader
          title="Reconciliation"
          description="Drift and sync events between local ledger and exchange state."
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Time</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {positions.reconciliations.map((event) => (
                <tr
                  key={event.id}
                  className="border-t border-white/5 text-slate-200"
                >
                  <td className="py-3 pr-4 text-xs text-slate-300">
                    {formatDateTime(event.createdAtMs)}
                  </td>
                  <td className="py-3 pr-4">{event.status}</td>
                  <td className="py-3 text-slate-300">{event.message}</td>
                </tr>
              ))}
              {positions.reconciliations.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="py-4 text-center text-xs text-slate-400"
                  >
                    No reconciliation events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
