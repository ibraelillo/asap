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
  await page.getByRole("link", { name: /range-reversal/i }).click();
  await expect(page).toHaveURL(`/strategies/${STRATEGY_ID}`);
  await expect(page.getByRole("heading", { name: STRATEGY_ID })).toBeVisible();
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
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("button", { name: "Reactivate" })).toBeVisible();

  await assertNoBrowserErrors();
});

test("bot create page supports production form interactions without errors", async ({
  page,
}) => {
  const assertNoBrowserErrors = attachBrowserErrorGuards(page);

  await page.goto("/bots/create");
  await expect(page.getByRole("heading", { name: "Create Bot" })).toBeVisible();

  await page.getByPlaceholder("SUIUSDTM").fill("SUIUSDTM");

  await expect(page.getByPlaceholder("Search account")).toHaveValue(
    "main-kucoin",
  );

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
  await expect(page.getByRole("heading", { name: "SUIUSDTM" })).toBeVisible();
  await expect(
    page.getByText(
      "Backtest queue, historical results, and bot-scoped validation jobs.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: /Run Backtest/i }).click();
  await expect(
    page.getByText(
      /Backtest queued|AI-integrated backtest queued|Backtest ready/,
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: /Run Validation/i }).click();
  await expect(
    page.getByText(/Validation queued|Validation completed/),
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
