import { useMemo, useState } from "react";
import { Bot, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Field, Input, MetricCard, PageHeader, Panel, Select } from "@repo/ui";
import { useAppShellData } from "../../layout/AppShell";
import { ReasonBadges, formatDateTime } from "../BotUi";

export function BotsIndexPage() {
  const { dashboard, isDashboardLoading, dashboardError } = useAppShellData();
  const [query, setQuery] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("all");

  const bots = dashboard?.bots ?? [];
  const strategies = useMemo(
    () => [...new Set(bots.map((bot) => bot.strategyId))].sort(),
    [bots],
  );
  const strategyOptions = useMemo(
    () => [
      { value: "all", label: "All strategies" },
      ...strategies.map((strategy) => ({ value: strategy, label: strategy })),
    ],
    [strategies],
  );
  const visibleBots = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return bots.filter((bot) => {
      const matchesStrategy =
        strategyFilter === "all" || bot.strategyId === strategyFilter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        bot.symbol.toLowerCase().includes(normalizedQuery) ||
        bot.botName.toLowerCase().includes(normalizedQuery) ||
        bot.exchangeId.toLowerCase().includes(normalizedQuery);
      return matchesStrategy && matchesQuery;
    });
  }, [bots, query, strategyFilter]);

  if (!dashboard && isDashboardLoading) {
    return (
      <Panel className="p-6 text-sm text-slate-300">Loading bots...</Panel>
    );
  }

  if (!dashboard || dashboardError) {
    return (
      <Panel className="p-6">
        <p className="text-sm text-rose-300">Failed to load bots.</p>
        <p className="mt-2 text-xs text-slate-400 mono">
          {dashboardError ?? "Unknown API error"}
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Trading Engine"
        title="Bots"
        description="Directory of configured bots. Use the bot page for runtime detail and the backtests page for historical analysis."
        actions={
          <Link
            to="/bots/create"
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-400/20"
          >
            <Plus className="h-4 w-4" />
            Create Bot
          </Link>
        }
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Configured Bots"
          value={String(bots.length)}
          icon={<Bot className="h-5 w-5" />}
        />
        <MetricCard
          label="Strategies In Use"
          value={String(strategies.length)}
          icon={<Search className="h-5 w-5" />}
        />
        <MetricCard
          label="Latest Runs"
          value={String(dashboard.recentRuns.length)}
          icon={<Bot className="h-5 w-5" />}
        />
      </section>

      <Panel className="p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search symbol, name, exchange"
                className="pl-9"
              />
            </div>
          </Field>

          <Field label="Strategy">
            <Select
              value={strategyFilter}
              onChange={setStrategyFilter}
              options={strategyOptions}
            />
          </Field>
        </div>
      </Panel>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {visibleBots.map((bot) => (
          <Link
            key={bot.botId}
            to={`/bots/${encodeURIComponent(bot.botId)}`}
            className="rounded-2xl border border-white/10 bg-slate-900/45 p-5 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.75)] backdrop-blur-md transition hover:border-cyan-300/25 hover:bg-white/5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-slate-100">
                  {bot.symbol}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {bot.strategyId} / {bot.exchangeId} / {bot.accountId}
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {bot.runStatus}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-300 md:grid-cols-4">
              <div>
                <p className="text-slate-400">Signal</p>
                <p className="mt-1 text-sm text-slate-100">
                  {bot.signal ?? "none"}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Processing</p>
                <p className="mt-1 text-sm text-slate-100">
                  {bot.processingStatus}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Price</p>
                <p className="mt-1 text-sm text-slate-100">
                  {bot.price?.toLocaleString() ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Updated</p>
                <p className="mt-1 text-sm text-slate-100">
                  {formatDateTime(bot.generatedAtMs)}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <ReasonBadges reasons={bot.reasons} />
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
