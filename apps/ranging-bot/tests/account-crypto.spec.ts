import { beforeEach, describe, expect, it } from "vitest";
import { decryptAccountAuth, encryptAccountAuth } from "../src/account-crypto";

describe("account auth encryption", () => {
  beforeEach(() => {
    process.env.ACCOUNTS_ENCRYPTION_KEY = "test-accounts-encryption-key";
  });

  it("encrypts and decrypts auth payloads deterministically by context", () => {
    const payload = encryptAccountAuth(
      {
        apiKey: "key",
        apiSecret: "secret",
        apiPassphrase: "passphrase",
      },
      {
        accountId: "acc-1",
        exchangeId: "kucoin",
      },
    );

    const decrypted = decryptAccountAuth(payload, {
      accountId: "acc-1",
      exchangeId: "kucoin",
    });

    expect(decrypted).toEqual({
      apiKey: "key",
      apiSecret: "secret",
      apiPassphrase: "passphrase",
    });
  });

  it("rejects decryption under a different account context", () => {
    const payload = encryptAccountAuth(
      {
        apiKey: "key",
        apiSecret: "secret",
      },
      {
        accountId: "acc-1",
        exchangeId: "kucoin",
      },
    );

    expect(() =>
      decryptAccountAuth(payload, {
        accountId: "acc-2",
        exchangeId: "kucoin",
      }),
    ).toThrow();
  });
});
