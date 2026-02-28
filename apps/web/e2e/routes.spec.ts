import { expect, test } from "@playwright/test";
import {
  ACCOUNT_ID,
  BACKTEST_ID,
  BOT_ID,
  STRATEGY_ID,
  TRADE_ID,
  attachBrowserErrorGuards,
  mockRangingApi,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockRangingApi(page);
});

test("results page renders without browser errors", async ({ page }) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto("/results");
  await expect(
    page.getByRole("heading", { name: "Live Results" }),
  ).toBeVisible();
  await expect(
    page.getByText("Execution + analysis stream from the running bots"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "SUIUSDTM" }).first(),
  ).toBeVisible();

  await assertNoBrowserErrors();
});

test("strategies pages render cleanly", async ({ page }) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto("/strategies");
  await expect(page.getByRole("heading", { name: "Strategies" })).toBeVisible();
  await page.getByRole("link", { name: /range reversal/i }).click();
  await expect(page).toHaveURL(`/strategies/${STRATEGY_ID}`);
  await expect(
    page.getByRole("heading", { name: "Range Reversal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Create Bot From Strategy/i }),
  ).toBeVisible();

  await assertNoBrowserErrors();
});

test("accounts page renders and supports status actions without errors", async ({
  page,
}) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await expect(page.getByText("main-kucoin")).toBeVisible();
  await expect(page.getByText("1043.75 USDT")).toBeVisible();
  await page.getByPlaceholder("Main KuCoin").fill("Research KuCoin");
  await page.getByPlaceholder("Paste API key").fill("key-2");
  await page.getByPlaceholder("Paste API secret").fill("secret-2");
  await page.getByPlaceholder("KuCoin passphrase").fill("pass-2");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("Account created.")).toBeVisible();
  await expect(page.getByText("Research KuCoin")).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Archive" }).first(),
  ).toBeDisabled();
  await expect(
    page.getByText(
      /Archive is blocked while one or more bots still use this account/i,
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Freeze" }).first().click();
  await expect(page.getByRole("button", { name: "Reactivate" })).toBeVisible();

  await assertNoBrowserErrors();
});

test("bot create page supports production form interactions without errors", async ({
  page,
}) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto("/bots/create");
  await expect(page.getByRole("heading", { name: "Create Bot" })).toBeVisible();
  await expect(
    page.getByText("Select a bot type to load strategy-specific parameters."),
  ).toBeVisible();

  await expect(page.getByPlaceholder("Search account")).toHaveValue(
    "main-kucoin",
  );
  await page.getByRole("button", { name: "Select strategy" }).click();
  await page.getByRole("option", { name: /Range Reversal/i }).click();

  await page.getByPlaceholder("Search symbol").fill("SUI");
  await page.getByRole("option", { name: /SUIUSDTM/i }).click();

  await page.getByRole("button", { name: "Create Bot" }).click();
  await expect(page).toHaveURL(`/bots/${BOT_ID}`);

  await assertNoBrowserErrors();
});

test("bot overview and positions pages render cleanly", async ({ page }) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto(`/bots/${BOT_ID}`);
  await expect(page.getByRole("heading", { name: "SUIUSDTM" })).toBeVisible();
  await expect(page.getByText(`ID: ${BOT_ID}`)).toBeVisible();
  await page.getByRole("link", { name: "Positions" }).first().click();

  await expect(page).toHaveURL(`/bots/${BOT_ID}/positions`);
  await expect(page.getByRole("heading", { name: /Positions/i })).toBeVisible();
  await expect(page.getByText("pos-sui-1")).toBeVisible();

  await assertNoBrowserErrors();
});

test("bot backtests page can queue jobs without browser errors", async ({
  page,
}) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto(`/bots/${BOT_ID}/backtests`);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText(
      "Backtest queue, historical results, and bot-scoped validation jobs.",
    ),
    { timeout: 10_000 },
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "SUIUSDTM" }),
    { timeout: 10_000 },
  ).toBeVisible();

  await page.getByRole("button", { name: /New Backtest/i }).first().click();
  await expect(
    page.getByRole("heading", { name: "Create Backtest" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Run Backtest/i }).click();
  await expect(page).toHaveURL(/\/bots\/.+\/backtests\/bt-sui-rerun-1$/);
  await expect(
    page.getByRole("heading", { name: "SUIUSDTM Replay" }),
  ).toBeVisible();

  await page.goto(`/bots/${BOT_ID}/backtests`);

  await page.getByRole("button", { name: /Run Validation/i }).click();
  await expect(
    page.getByText(/Validation queued|Validation completed/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit & Rerun" }).nth(1).click();
  const rerunDrawer = page.getByRole("dialog");
  await expect(
    rerunDrawer.getByRole("heading", { name: /Edit .* And Run/ }),
  ).toBeVisible();
  await expect(
    rerunDrawer.getByRole("button", { name: /Run Backtest/i }),
  ).toBeVisible();
  await expect(
    rerunDrawer.getByText("AI range validation"),
  ).toBeVisible();

  await assertNoBrowserErrors();
});

test("backtest replay page renders charts without browser errors", async ({
  page,
}) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto(`/bots/${BOT_ID}/backtests/${BACKTEST_ID}`);
  await expect(
    page.getByRole("heading", { name: "SUIUSDTM Replay" }),
  ).toBeVisible();
  await expect(page.getByText("Backtest Replay")).toBeVisible();
  await expect(
    page.getByText(
      "Trade range levels: VAL (green dashed), POC (blue), VAH (amber dashed)",
    ),
  ).toBeVisible();
  await expect(page.getByText("AI-integrated")).toBeVisible();
  await expect(page.getByText("Strategy Snapshot")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit & Rerun" })).toBeVisible();
  await page.getByRole("button", { name: "Edit & Rerun" }).click();
  const rerunDrawer = page.getByRole("dialog");
  await expect(
    rerunDrawer.getByRole("heading", { name: /Edit .* And Run/ }),
  ).toBeVisible();
  await expect(
    rerunDrawer.getByRole("button", { name: /Run Backtest/i }),
  ).toBeVisible();

  await assertNoBrowserErrors();
});

test("trade analysis page renders and charts a selected trade cleanly", async ({
  page,
}) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto("/trade-analysis");
  await expect(
    page.getByRole("heading", { name: "Trade Analysis" }),
  ).toBeVisible();
  await expect(page.getByText("Estimated locked gain at TP2")).toBeVisible();
  await expect(page.getByText(`Selected Trade ID: ${TRADE_ID}`)).toBeVisible();

  await assertNoBrowserErrors();
});
