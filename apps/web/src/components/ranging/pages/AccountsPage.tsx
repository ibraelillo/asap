import { useMemo, useState, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { KeyRound, Plus, RotateCcw, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Button,
  Field,
  Input,
  MetricCard,
  PageHeader,
  Panel,
  Select,
} from "@repo/ui";
import {
  createAccount,
  fetchAccounts,
  fetchBots,
  patchAccount,
} from "../../../lib/ranging-api";
import { formatDateTime } from "../BotUi";
import {
  getSupportedExchange,
  SUPPORTED_EXCHANGES,
} from "../supportedExchanges";

type AccountAuthForm = {
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
};

const emptyAuthForm: AccountAuthForm = {
  apiKey: "",
  apiSecret: "",
  apiPassphrase: "",
};

export function AccountsPage() {
  const { mutate } = useSWRConfig();
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [savingAuthAccountId, setSavingAuthAccountId] = useState<string | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [createForm, setCreateForm] = useState({
    name: "",
    exchangeId: SUPPORTED_EXCHANGES[0]?.id ?? "kucoin",
    apiKey: "",
    apiSecret: "",
    apiPassphrase: "",
  });
  const [authForm, setAuthForm] = useState<AccountAuthForm>(emptyAuthForm);
  const { data: accounts, isLoading } = useSWR(
    "accounts-page",
    () => fetchAccounts(undefined, { includeBalance: true }),
    { revalidateOnFocus: false },
  );
  const { data: bots } = useSWR("bots-page-accounts", () => fetchBots(), {
    revalidateOnFocus: false,
  });

  const activeCount = (accounts ?? []).filter(
    (account) => account.status === "active",
  ).length;
  const pausedCount = (accounts ?? []).filter(
    (account) => account.status === "paused",
  ).length;
  const archivedCount = (accounts ?? []).filter(
    (account) => account.status === "archived",
  ).length;

  const exchangeOptions = useMemo(
    () =>
      SUPPORTED_EXCHANGES.map((exchange) => ({
        value: exchange.id,
        label: exchange.label,
        description: exchange.description,
      })),
    [],
  );

  const botCountByAccount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bot of bots ?? []) {
      counts.set(bot.accountId, (counts.get(bot.accountId) ?? 0) + 1);
    }
    return counts;
  }, [bots]);

  async function refreshData() {
    await Promise.all([
      mutate("accounts-page"),
      mutate("accounts"),
      mutate("bots-page-accounts"),
    ]);
  }

  async function changeAccountStatus(
    accountId: string,
    status: "active" | "paused" | "archived",
  ) {
    setActionError(undefined);
    setFormError(undefined);
    setNotice(undefined);
    setPendingAccountId(accountId);

    try {
      await patchAccount(accountId, { status });
      await refreshData();
      setNotice(
        status === "archived"
          ? "Account archived."
          : status === "paused"
            ? "Account frozen."
            : "Account reactivated.",
      );
    } catch (action) {
      setActionError(action instanceof Error ? action.message : String(action));
    } finally {
      setPendingAccountId(null);
    }
  }

  async function onCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(undefined);
    setFormError(undefined);
    setNotice(undefined);
    setCreating(true);

    try {
      if (createForm.name.trim().length === 0) {
        throw new Error("Missing account name");
      }
      if (
        createForm.apiKey.trim().length === 0 ||
        createForm.apiSecret.trim().length === 0
      ) {
        throw new Error("Missing API key or secret");
      }
      if (
        createForm.exchangeId === "kucoin" &&
        createForm.apiPassphrase.trim().length === 0
      ) {
        throw new Error("Missing KuCoin passphrase");
      }

      await createAccount({
        name: createForm.name.trim(),
        exchangeId: createForm.exchangeId,
        auth: {
          apiKey: createForm.apiKey.trim(),
          apiSecret: createForm.apiSecret.trim(),
          apiPassphrase: createForm.apiPassphrase.trim() || undefined,
        },
      });

      setCreateForm((current) => ({
        ...current,
        name: "",
        apiKey: "",
        apiSecret: "",
        apiPassphrase: "",
      }));
      await refreshData();
      setNotice("Account created.");
    } catch (creation) {
      setFormError(
        creation instanceof Error ? creation.message : String(creation),
      );
    } finally {
      setCreating(false);
    }
  }

  function startEditingAuth(accountId: string) {
    setActionError(undefined);
    setFormError(undefined);
    setNotice(undefined);
    setEditingAccountId(accountId);
    setAuthForm(emptyAuthForm);
  }

  async function saveAuth(accountId: string) {
    setActionError(undefined);
    setFormError(undefined);
    setNotice(undefined);

    const nextAuth = {
      apiKey: authForm.apiKey.trim() || undefined,
      apiSecret: authForm.apiSecret.trim() || undefined,
      apiPassphrase: authForm.apiPassphrase.trim() || undefined,
    };

    if (!nextAuth.apiKey && !nextAuth.apiSecret && !nextAuth.apiPassphrase) {
      setActionError("Enter at least one credential field to rotate auth");
      return;
    }

    setSavingAuthAccountId(accountId);
    try {
      await patchAccount(accountId, { auth: nextAuth });
      await refreshData();
      setEditingAccountId(null);
      setAuthForm(emptyAuthForm);
      setNotice("Account credentials updated.");
    } catch (saving) {
      setActionError(saving instanceof Error ? saving.message : String(saving));
    } finally {
      setSavingAuthAccountId(null);
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
        description="Execution identities bound to exchange adapters. Create, rotate, and archive accounts here without deleting their history."
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

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
          label="Frozen"
          value={String(pausedCount)}
          icon={<KeyRound className="h-5 w-5" />}
        />
        <MetricCard
          label="Archived"
          value={String(archivedCount)}
          icon={<Wallet className="h-5 w-5" />}
        />
      </section>

      {notice ? (
        <Panel className="p-4 text-sm text-emerald-300">{notice}</Panel>
      ) : null}
      {actionError ? (
        <Panel className="p-4 text-sm text-rose-300">{actionError}</Panel>
      ) : null}

      <Panel as="form" className="space-y-5 p-6" onSubmit={onCreateAccount}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Create
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">
              New account
            </h2>
            <p className="mt-1 text-sm text-slate-300/80">
              Add exchange credentials outside the bot creation flow so accounts
              can be reused across multiple bots.
            </p>
          </div>
          <Panel className="max-w-sm p-4" tone="muted">
            <p className="font-medium text-cyan-100">
              {getSupportedExchange(createForm.exchangeId)?.label ??
                createForm.exchangeId}
            </p>
            <p className="mt-1 text-sm text-slate-300/80">
              {getSupportedExchange(createForm.exchangeId)?.description}
            </p>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Exchange">
            <Select
              value={createForm.exchangeId}
              onChange={(exchangeId) =>
                setCreateForm((current) => ({ ...current, exchangeId }))
              }
              options={exchangeOptions}
            />
          </Field>

          <Field label="Account name" error={formError}>
            <Input
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Main KuCoin"
            />
          </Field>

          <Field label="API Key">
            <Input
              value={createForm.apiKey}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
              placeholder="Paste API key"
              type="password"
            />
          </Field>

          <Field label="API Secret">
            <Input
              value={createForm.apiSecret}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  apiSecret: event.target.value,
                }))
              }
              placeholder="Paste API secret"
              type="password"
            />
          </Field>

          <Field
            label="Passphrase"
            description={
              createForm.exchangeId === "kucoin"
                ? "Required for KuCoin accounts."
                : undefined
            }
          >
            <Input
              value={createForm.apiPassphrase}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  apiPassphrase: event.target.value,
                }))
              }
              placeholder="KuCoin passphrase"
              type="password"
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={creating}
            leadingIcon={<Plus className="h-4 w-4" />}
          >
            {creating ? "Creating..." : "Create Account"}
          </Button>
        </div>
      </Panel>

      <section className="space-y-4">
        {(accounts ?? []).map((account) => (
          <Panel key={account.id} className="p-5">
            {(() => {
              const boundBots = botCountByAccount.get(account.id) ?? 0;
              const canArchive = boundBots === 0;
              return (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-slate-100">
                        {account.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {account.exchangeId} / {account.id}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                        {account.status}
                      </span>
                      <Button
                        size="sm"
                        variant={
                          editingAccountId === account.id
                            ? "ghost"
                            : "secondary"
                        }
                        leadingIcon={<RotateCcw className="h-4 w-4" />}
                        onClick={() =>
                          editingAccountId === account.id
                            ? setEditingAccountId(null)
                            : startEditingAuth(account.id)
                        }
                      >
                        {editingAccountId === account.id
                          ? "Cancel"
                          : "Rotate Auth"}
                      </Button>
                      {account.status === "active" ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pendingAccountId === account.id}
                            onClick={() =>
                              void changeAccountStatus(account.id, "paused")
                            }
                          >
                            Freeze
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={
                              pendingAccountId === account.id || !canArchive
                            }
                            onClick={() =>
                              void changeAccountStatus(account.id, "archived")
                            }
                          >
                            Archive
                          </Button>
                        </>
                      ) : account.status === "paused" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={pendingAccountId === account.id}
                            onClick={() =>
                              void changeAccountStatus(account.id, "active")
                            }
                          >
                            Reactivate
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={
                              pendingAccountId === account.id || !canArchive
                            }
                            onClick={() =>
                              void changeAccountStatus(account.id, "archived")
                            }
                          >
                            Archive
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          disabled={pendingAccountId === account.id}
                          onClick={() =>
                            void changeAccountStatus(account.id, "active")
                          }
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-slate-200 md:grid-cols-3 xl:grid-cols-6">
                    <div>
                      <p className="text-xs text-slate-400">Bound bots</p>
                      <p className="mt-1">{boundBots}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Total balance</p>
                      <p className="mt-1">
                        {account.balance?.error
                          ? "unavailable"
                          : account.balance
                            ? `${account.balance.total.toFixed(2)} ${account.balance.currency}`
                            : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Available</p>
                      <p className="mt-1">
                        {account.balance?.error
                          ? "unavailable"
                          : account.balance
                            ? `${account.balance.available.toFixed(2)} ${account.balance.currency}`
                            : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">API Key</p>
                      <p className="mt-1">
                        {account.hasAuth.apiKey ? "configured" : "missing"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Secret</p>
                      <p className="mt-1">
                        {account.hasAuth.apiSecret ? "configured" : "missing"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Updated</p>
                      <p className="mt-1">
                        {formatDateTime(account.updatedAtMs)}
                      </p>
                    </div>
                  </div>

                  {account.balance?.error ? (
                    <p className="mt-3 text-xs text-amber-300/90">
                      Balance unavailable: {account.balance.error}
                    </p>
                  ) : null}

                  {!canArchive ? (
                    <p className="mt-3 text-xs text-slate-400">
                      Archive is blocked while one or more bots still use this
                      account. Pause or archive those bots first.
                    </p>
                  ) : null}

                  {editingAccountId === account.id ? (
                    <Panel className="mt-4 space-y-4 p-4" tone="muted">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          Credential rotation
                        </p>
                        <p className="mt-1 text-sm text-slate-300/80">
                          Leave fields empty to keep the current value. For
                          KuCoin, include the passphrase when rotating key or
                          secret.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Field label="New API Key">
                          <Input
                            value={authForm.apiKey}
                            onChange={(event) =>
                              setAuthForm((current) => ({
                                ...current,
                                apiKey: event.target.value,
                              }))
                            }
                            placeholder="Optional new API key"
                            type="password"
                          />
                        </Field>

                        <Field label="New API Secret">
                          <Input
                            value={authForm.apiSecret}
                            onChange={(event) =>
                              setAuthForm((current) => ({
                                ...current,
                                apiSecret: event.target.value,
                              }))
                            }
                            placeholder="Optional new API secret"
                            type="password"
                          />
                        </Field>

                        <Field label="New passphrase">
                          <Input
                            value={authForm.apiPassphrase}
                            onChange={(event) =>
                              setAuthForm((current) => ({
                                ...current,
                                apiPassphrase: event.target.value,
                              }))
                            }
                            placeholder="Optional new passphrase"
                            type="password"
                          />
                        </Field>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingAccountId(null);
                            setAuthForm(emptyAuthForm);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={savingAuthAccountId === account.id}
                          onClick={() => void saveAuth(account.id)}
                        >
                          {savingAuthAccountId === account.id
                            ? "Saving..."
                            : "Save Credentials"}
                        </Button>
                      </div>
                    </Panel>
                  ) : null}
                </>
              );
            })()}
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
