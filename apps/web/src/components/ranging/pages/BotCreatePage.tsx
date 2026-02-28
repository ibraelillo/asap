import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Checkbox,
  Combobox,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
} from "@repo/ui";
import useSWR, { useSWRConfig } from "swr";
import {
  createAccount,
  createBot,
  fetchAccounts,
  fetchStrategies,
} from "../../../lib/ranging-api";
import {
  getSupportedExchange,
  SUPPORTED_EXCHANGES,
} from "../supportedExchanges";

const EXECUTION_TIMEFRAME_OPTIONS = [
  { value: "1h", label: "1h" },
  { value: "2h", label: "2h" },
  { value: "4h", label: "4h" },
] as const;

const PRIMARY_RANGE_OPTIONS = [
  { value: "1d", label: "1d" },
  { value: "1w", label: "1w" },
] as const;

const SECONDARY_RANGE_OPTIONS = [
  { value: "4h", label: "4h" },
  { value: "12h", label: "12h" },
  { value: "1d", label: "1d" },
] as const;

const MARGIN_MODE_OPTIONS = [
  { value: "CROSS", label: "Cross" },
  { value: "ISOLATED", label: "Isolated" },
] as const;

type AccountMode = "existing" | "create";

export function BotCreatePage() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const [searchParams] = useSearchParams();
  const preselectedStrategy =
    searchParams.get("strategyId")?.trim() || "range-reversal";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [accountMode, setAccountMode] = useState<AccountMode>("existing");
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    strategyId: preselectedStrategy,
    exchangeId: SUPPORTED_EXCHANGES[0]?.id ?? "kucoin",
    accountId: "",
    enabled: true,
    executionTimeframe: "1h",
    primaryRangeTimeframe: "1d",
    secondaryRangeTimeframe: "4h",
    executionLimit: 240,
    primaryRangeLimit: 90,
    secondaryRangeLimit: 180,
    dryRun: true,
    marginMode: "CROSS" as "CROSS" | "ISOLATED",
    valueQty: "100",
  });
  const [newAccount, setNewAccount] = useState({
    name: "",
    apiKey: "",
    apiSecret: "",
    apiPassphrase: "",
  });
  const { data: strategies } = useSWR(
    ["strategies-create", 24],
    ([, windowHours]) => fetchStrategies(Number(windowHours)),
    { revalidateOnFocus: false },
  );
  const { data: accounts, isLoading: accountsLoading } = useSWR(
    ["accounts", form.exchangeId],
    ([, exchangeId]) => fetchAccounts(String(exchangeId)),
    { revalidateOnFocus: false },
  );

  const strategyOptions = useMemo(() => {
    if (!strategies || strategies.length === 0) {
      return [{ value: "range-reversal", label: "Range Reversal" }];
    }

    return strategies.map((strategy) => ({
      value: strategy.strategyId,
      label: strategy.label,
      description: `${strategy.strategyId} · manifest v${strategy.manifestVersion}`,
    }));
  }, [strategies]);

  const exchangeOptions = useMemo(
    () =>
      SUPPORTED_EXCHANGES.map((exchange) => ({
        value: exchange.id,
        label: exchange.label,
        description: exchange.description,
      })),
    [],
  );

  const filteredAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (account) => account.exchangeId === form.exchangeId,
      ),
    [accounts, form.exchangeId],
  );

  const accountOptions = useMemo(
    () =>
      filteredAccounts.map((account) => ({
        value: account.id,
        label: account.name,
        description: `${account.id} · auth ${account.hasAuth.apiKey && account.hasAuth.apiSecret ? "configured" : "partial"}`,
      })),
    [filteredAccounts],
  );

  useEffect(() => {
    if (accountsLoading) return;

    if (accountMode === "create") {
      if (form.accountId) {
        setForm((current) => ({ ...current, accountId: "" }));
      }
      return;
    }

    if (filteredAccounts.length === 0) {
      setAccountMode("create");
      if (form.accountId) {
        setForm((current) => ({ ...current, accountId: "" }));
      }
      return;
    }

    if (!filteredAccounts.some((account) => account.id === form.accountId)) {
      setForm((current) => ({
        ...current,
        accountId: filteredAccounts[0]?.id ?? "",
      }));
    }
  }, [accountMode, accountsLoading, filteredAccounts, form.accountId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);

    try {
      let accountId = form.accountId.trim();

      if (accountMode === "create") {
        if (newAccount.name.trim().length === 0) {
          throw new Error("Missing account name");
        }
        if (
          newAccount.apiKey.trim().length === 0 ||
          newAccount.apiSecret.trim().length === 0
        ) {
          throw new Error("Missing API key or secret");
        }
        if (
          form.exchangeId === "kucoin" &&
          newAccount.apiPassphrase.trim().length === 0
        ) {
          throw new Error("Missing KuCoin passphrase");
        }

        const createdAccount = await createAccount({
          name: newAccount.name.trim(),
          exchangeId: form.exchangeId,
          auth: {
            apiKey: newAccount.apiKey.trim(),
            apiSecret: newAccount.apiSecret.trim(),
            apiPassphrase: newAccount.apiPassphrase.trim() || undefined,
          },
        });

        accountId = createdAccount.id;
        await mutate(["accounts", form.exchangeId]);
      }

      if (accountId.length === 0) {
        throw new Error("Select or create an account before creating the bot");
      }

      const bot = await createBot({
        name: form.name.trim() || undefined,
        symbol: form.symbol.trim().toUpperCase(),
        strategyId: form.strategyId,
        exchangeId: form.exchangeId,
        accountId,
        enabled: form.enabled,
        executionTimeframe: form.executionTimeframe,
        primaryRangeTimeframe: form.primaryRangeTimeframe,
        secondaryRangeTimeframe: form.secondaryRangeTimeframe,
        executionLimit: form.executionLimit,
        primaryRangeLimit: form.primaryRangeLimit,
        secondaryRangeLimit: form.secondaryRangeLimit,
        dryRun: form.dryRun,
        marginMode: form.marginMode,
        valueQty: form.valueQty.trim(),
      });

      const botId = typeof bot.id === "string" ? bot.id : undefined;
      navigate(botId ? `/bots/${encodeURIComponent(botId)}` : "/bots");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const existingAccountsAvailable = filteredAccounts.length > 0;
  const canSubmit =
    form.symbol.trim().length > 0 &&
    (accountMode === "create" || form.accountId.trim().length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Trading Engine"
        title="Create Bot"
        description="Persist a bot definition, bind it to an execution account, and make it eligible for scheduled runs."
        actions={
          <Link
            to="/accounts"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
          >
            Manage Accounts
          </Link>
        }
      />

      <Panel as="form" className="space-y-6 p-6" onSubmit={onSubmit}>
        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Identity
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">
              Bot definition
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Strategy">
              <Select
                value={form.strategyId}
                onChange={(strategyId) =>
                  setForm((current) => ({ ...current, strategyId }))
                }
                options={strategyOptions}
              />
            </Field>

            <Field label="Symbol">
              <Input
                value={form.symbol}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    symbol: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="SUIUSDTM"
              />
            </Field>

            <Field label="Name">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Optional display name"
              />
            </Field>

            <Field label="Exchange">
              <Select
                value={form.exchangeId}
                onChange={(exchangeId) => {
                  setForm((current) => ({
                    ...current,
                    exchangeId,
                    accountId: "",
                  }));
                  setAccountMode("existing");
                }}
                options={exchangeOptions}
              />
            </Field>
          </div>

          <Panel className="p-4" tone="muted">
            <p className="font-medium text-cyan-100">
              {getSupportedExchange(form.exchangeId)?.label ?? form.exchangeId}
            </p>
            <p className="mt-1 text-sm text-slate-300/80">
              {getSupportedExchange(form.exchangeId)?.description}
            </p>
          </Panel>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Execution Account
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">
                Account binding
              </h2>
            </div>
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-xs text-slate-300">
              <button
                type="button"
                onClick={() => setAccountMode("existing")}
                disabled={!existingAccountsAvailable}
                className={`rounded-full px-3 py-1.5 transition ${
                  accountMode === "existing"
                    ? "bg-cyan-400/15 text-cyan-100"
                    : "text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                }`}
              >
                Existing account
              </button>
              <button
                type="button"
                onClick={() => setAccountMode("create")}
                className={`rounded-full px-3 py-1.5 transition ${
                  accountMode === "create"
                    ? "bg-cyan-400/15 text-cyan-100"
                    : "text-slate-300"
                }`}
              >
                Create account
              </button>
            </div>
          </div>

          {accountMode === "existing" ? (
            <div className="space-y-3">
              <Field label="Stored account">
                <Combobox
                  value={form.accountId || undefined}
                  onChange={(accountId) =>
                    setForm((current) => ({
                      ...current,
                      accountId: accountId ?? "",
                    }))
                  }
                  options={accountOptions}
                  disabled={accountsLoading || filteredAccounts.length === 0}
                  placeholder={
                    accountsLoading ? "Loading accounts..." : "Search account"
                  }
                  emptyState="No account configured for this exchange"
                />
              </Field>

              <Panel className="px-4 py-3" tone="muted">
                {accountsLoading ? (
                  <p className="text-sm text-slate-300">Loading accounts...</p>
                ) : filteredAccounts.length === 0 ? (
                  <p className="text-sm text-slate-300">
                    No account exists yet for this exchange. Switch to{" "}
                    <span className="text-cyan-100">Create account</span>.
                  </p>
                ) : (
                  <p className="text-sm text-slate-300">
                    {filteredAccounts.length} stored account(s) available for{" "}
                    {form.exchangeId}.
                  </p>
                )}
              </Panel>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Account name">
                <Input
                  value={newAccount.name}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="main-kucoin"
                />
              </Field>

              <Field label="API key">
                <Input
                  value={newAccount.apiKey}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      apiKey: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="API secret">
                <Input
                  type="password"
                  value={newAccount.apiSecret}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      apiSecret: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="API passphrase">
                <Input
                  type="password"
                  value={newAccount.apiPassphrase}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      apiPassphrase: event.target.value,
                    }))
                  }
                />
              </Field>

              <Panel
                className="md:col-span-2 xl:col-span-4 px-4 py-3 text-sm text-amber-100/90"
                tone="warning"
              >
                Account auth is persisted in the bot datastore so scheduled
                workers can execute with that account. This is functional for
                now, but it should move to a dedicated secret store later.
              </Panel>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Execution
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">
              Runtime parameters
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Execution TF">
              <Select
                value={form.executionTimeframe}
                onChange={(executionTimeframe) =>
                  setForm((current) => ({ ...current, executionTimeframe }))
                }
                options={EXECUTION_TIMEFRAME_OPTIONS}
              />
            </Field>

            <Field label="Primary Range TF">
              <Select
                value={form.primaryRangeTimeframe}
                onChange={(primaryRangeTimeframe) =>
                  setForm((current) => ({ ...current, primaryRangeTimeframe }))
                }
                options={PRIMARY_RANGE_OPTIONS}
              />
            </Field>

            <Field label="Secondary Range TF">
              <Select
                value={form.secondaryRangeTimeframe}
                onChange={(secondaryRangeTimeframe) =>
                  setForm((current) => ({
                    ...current,
                    secondaryRangeTimeframe,
                  }))
                }
                options={SECONDARY_RANGE_OPTIONS}
              />
            </Field>

            <Field label="Margin Mode">
              <Select
                value={form.marginMode}
                onChange={(marginMode) =>
                  setForm((current) => ({ ...current, marginMode }))
                }
                options={MARGIN_MODE_OPTIONS}
              />
            </Field>

            <Field label="Execution Limit">
              <Input
                type="number"
                min={50}
                value={form.executionLimit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    executionLimit: Math.max(
                      50,
                      Number(event.target.value) || 240,
                    ),
                  }))
                }
              />
            </Field>

            <Field label="Primary Range Limit">
              <Input
                type="number"
                min={30}
                value={form.primaryRangeLimit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    primaryRangeLimit: Math.max(
                      30,
                      Number(event.target.value) || 90,
                    ),
                  }))
                }
              />
            </Field>

            <Field label="Secondary Range Limit">
              <Input
                type="number"
                min={30}
                value={form.secondaryRangeLimit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    secondaryRangeLimit: Math.max(
                      30,
                      Number(event.target.value) || 180,
                    ),
                  }))
                }
              />
            </Field>

            <Field label="Value Qty">
              <Input
                value={form.valueQty}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    valueQty: event.target.value,
                  }))
                }
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <Checkbox
              checked={form.enabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
              label="Enabled"
            />
            <Checkbox
              checked={form.dryRun}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  dryRun: event.target.checked,
                }))
              }
              label="Dry Run"
            />
          </div>
        </section>

        {error ? (
          <Panel className="px-3 py-2 text-sm text-rose-200" tone="danger">
            {error}
          </Panel>
        ) : null}

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={submitting || !canSubmit}
            variant="primary"
          >
            {submitting ? "Creating..." : "Create Bot"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/bots")}
          >
            Cancel
          </Button>
        </div>
      </Panel>
    </div>
  );
}
