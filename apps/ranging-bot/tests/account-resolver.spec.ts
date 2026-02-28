import { beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeAccountResolver } from "../src/account-resolver";
import {
  getAccountRecordById,
  listAccountRecords,
} from "../src/monitoring/store";

vi.mock("../src/monitoring/store", () => ({
  getAccountRecordById: vi.fn(),
  listAccountRecords: vi.fn(),
}));

describe("RuntimeAccountResolver", () => {
  const resolver = new RuntimeAccountResolver();

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.KUCOIN_API_KEY;
    delete process.env.KUCOIN_API_SECRET;
    delete process.env.KUCOIN_API_PASSPHRASE;
  });

  it("returns stored active accounts", async () => {
    vi.mocked(getAccountRecordById).mockResolvedValue({
      id: "kucoin-main",
      name: "Main KuCoin",
      exchangeId: "kucoin",
      status: "active",
      auth: {
        apiKey: "key",
        apiSecret: "secret",
        apiPassphrase: "pass",
      },
      createdAtMs: 1,
      updatedAtMs: 2,
    });

    const account = await resolver.requireAccount("kucoin-main", "kucoin");

    expect(account.id).toBe("kucoin-main");
    expect(account.exchangeId).toBe("kucoin");
  });

  it("falls back to the env-backed default kucoin account", async () => {
    vi.mocked(getAccountRecordById).mockResolvedValue(undefined);
    process.env.KUCOIN_API_KEY = "env-key";
    process.env.KUCOIN_API_SECRET = "env-secret";
    process.env.KUCOIN_API_PASSPHRASE = "env-pass";

    const account = await resolver.requireAccount("default", "kucoin");

    expect(account.id).toBe("default");
    expect(account.exchangeId).toBe("kucoin");
    expect(account.auth.apiKey).toBe("env-key");
    expect(account.metadata?.source).toBe("env");
  });

  it("filters listAccounts by exchange", async () => {
    vi.mocked(listAccountRecords).mockResolvedValue([
      {
        id: "kucoin-main",
        name: "Main KuCoin",
        exchangeId: "kucoin",
        status: "active",
        auth: {
          apiKey: "key",
          apiSecret: "secret",
          apiPassphrase: "pass",
        },
        createdAtMs: 1,
        updatedAtMs: 2,
      },
      {
        id: "binance-main",
        name: "Main Binance",
        exchangeId: "binance",
        status: "active",
        auth: {
          apiKey: "key",
          apiSecret: "secret",
        },
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    ]);

    const accounts = await resolver.listAccounts("kucoin");

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.id).toBe("kucoin-main");
  });
});
