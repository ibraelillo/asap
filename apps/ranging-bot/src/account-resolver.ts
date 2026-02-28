import type { AccountResolver } from "@repo/trading-engine";
import {
  getAccountRecordById,
  listAccountRecords,
} from "./monitoring/store";
import type { AccountRecord } from "./monitoring/types";

function buildEnvKucoinAccount(
  accountId: string,
  exchangeId?: string,
): AccountRecord | null {
  if (accountId !== "default") return null;
  if (exchangeId && exchangeId !== "kucoin") return null;

  const apiKey = process.env.KUCOIN_API_KEY;
  const apiSecret = process.env.KUCOIN_API_SECRET;
  const apiPassphrase = process.env.KUCOIN_API_PASSPHRASE;

  if (!apiKey || !apiSecret || !apiPassphrase) {
    return null;
  }

  return {
    id: "default",
    name: "Default KuCoin Environment Account",
    exchangeId: "kucoin",
    status: "active",
    auth: {
      apiKey,
      apiSecret,
      apiPassphrase,
    },
    metadata: {
      source: "env",
    },
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

export class RuntimeAccountResolver
  implements AccountResolver<AccountRecord>
{
  async getAccount(
    accountId: string,
    exchangeId?: string,
  ): Promise<AccountRecord | null> {
    const stored = await getAccountRecordById(accountId);
    if (stored) {
      if (exchangeId && stored.exchangeId !== exchangeId) {
        throw new Error(
          `Account ${stored.id} belongs to ${stored.exchangeId}, expected ${exchangeId}`,
        );
      }
      return stored;
    }

    return buildEnvKucoinAccount(accountId, exchangeId);
  }

  async requireAccount(
    accountId: string,
    exchangeId?: string,
  ): Promise<AccountRecord> {
    const account = await this.getAccount(accountId, exchangeId);
    if (!account) {
      throw new Error(`Missing account credentials for ${accountId}`);
    }

    if (account.status !== "active") {
      throw new Error(`Account ${account.id} is not active`);
    }

    return account;
  }

  async listAccounts(exchangeId?: string): Promise<AccountRecord[]> {
    const accounts = await listAccountRecords(500);
    if (!exchangeId) return accounts;
    return accounts.filter((account) => account.exchangeId === exchangeId);
  }
}

export const runtimeAccountResolver = new RuntimeAccountResolver();

