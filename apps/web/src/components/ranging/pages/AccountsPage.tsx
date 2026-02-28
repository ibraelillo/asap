import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { KeyRound, Plus, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, MetricCard, PageHeader, Panel } from "@repo/ui";
import { fetchAccounts, fetchBots, patchAccount } from "../../../lib/ranging-api";
import { formatDateTime } from "../BotUi";

export function AccountsPage() {
  const { mutate } = useSWRConfig();
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const { data: accounts, isLoading } = useSWR(
    "accounts-page",
    () => fetchAccounts(),
    { revalidateOnFocus: false },
  );
  const { data: bots } = useSWR("bots-page-accounts", () => fetchBots(), {
    revalidateOnFocus: false,
  });

  const activeCount = (accounts ?? []).filter(
    (account) => account.status === "active",
  ).length;
  const archivedCount = (accounts ?? []).filter(
    (account) => account.status === "archived",
  ).length;

  const botCountByAccount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bot of bots ?? []) {
      counts.set(bot.accountId, (counts.get(bot.accountId) ?? 0) + 1);
    }
    return counts;
  }, [bots]);

  async function changeAccountStatus(
    accountId: string,
    status: "active" | "archived",
  ) {
    setError(undefined);
    setPendingAccountId(accountId);

    try {
      await patchAccount(accountId, { status });
      await Promise.all([mutate("accounts-page"), mutate("accounts")]);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : String(actionError),
      );
    } finally {
      setPendingAccountId(null);
    }
  }

  if (!accounts && isLoading) {
    return (
      <Panel className="p-6 text-sm text-slate-300">Loading accounts...</Panel>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Trading Engine"
        title="Accounts"
        description="Execution identities bound to exchange adapters. Archive accounts here without deleting their history."
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
          label="Accounts"
          value={String(accounts?.length ?? 0)}
          icon={<Wallet className="h-5 w-5" />}
        />
        <MetricCard
          label="Active"
          value={String(activeCount)}
          icon={<KeyRound className="h-5 w-5" />}
        />
        <MetricCard
          label="Archived"
          value={String(archivedCount)}
          icon={<Wallet className="h-5 w-5" />}
        />
      </section>

      {error ? (
        <Panel className="p-4 text-sm text-rose-300">{error}</Panel>
      ) : null}

      <section className="space-y-4">
        {(accounts ?? []).map((account) => (
          <Panel key={account.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-slate-100">
                  {account.name}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {account.exchangeId} / {account.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  {account.status}
                </span>
                {account.status === "active" ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pendingAccountId === account.id}
                    onClick={() => void changeAccountStatus(account.id, "archived")}
                  >
                    Archive
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={pendingAccountId === account.id}
                    onClick={() => void changeAccountStatus(account.id, "active")}
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4 text-sm text-slate-200">
              <div>
                <p className="text-xs text-slate-400">Bound bots</p>
                <p className="mt-1">{botCountByAccount.get(account.id) ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">API Key</p>
                <p className="mt-1">{account.hasAuth.apiKey ? "configured" : "missing"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Secret</p>
                <p className="mt-1">
                  {account.hasAuth.apiSecret ? "configured" : "missing"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Updated</p>
                <p className="mt-1">{formatDateTime(account.updatedAtMs)}</p>
              </div>
            </div>
          </Panel>
        ))}

        {(accounts ?? []).length === 0 ? (
          <Panel className="p-6 text-sm text-slate-300">
            No accounts created yet.
          </Panel>
        ) : null}
      </section>
    </div>
  );
}

