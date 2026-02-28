import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Resource } from "sst";
import type { AccountAuthRecord } from "./monitoring/types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const VERSION = 1;

export interface EncryptedAccountAuthPayload {
  alg: typeof ALGORITHM;
  v: typeof VERSION;
  iv: string;
  tag: string;
  ciphertext: string;
}

function getAccountsEncryptionSecret(): string {
  try {
    const resources = Resource as unknown as Record<
      string,
      { value?: string } | undefined
    >;
    const linkedValue = resources.AccountsEncryptionKey?.value;
    if (linkedValue && linkedValue.trim().length > 0) {
      return linkedValue.trim();
    }
  } catch {
    // fall through to local env fallback for tests/non-SST execution
  }

  const envFallback = process.env.ACCOUNTS_ENCRYPTION_KEY?.trim();
  if (envFallback) {
    return envFallback;
  }

  throw new Error("Missing linked Resource.AccountsEncryptionKey");
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest().subarray(0, KEY_LENGTH);
}

function buildAad(accountId: string, exchangeId: string): Buffer {
  return Buffer.from(`${accountId}:${exchangeId}`, "utf8");
}

export function encryptAccountAuth(
  auth: AccountAuthRecord,
  context: { accountId: string; exchangeId: string },
): EncryptedAccountAuthPayload {
  const key = deriveKey(getAccountsEncryptionSecret());
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(buildAad(context.accountId, context.exchangeId));

  const plaintext = JSON.stringify(auth);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    alg: ALGORITHM,
    v: VERSION,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptAccountAuth(
  payload: EncryptedAccountAuthPayload,
  context: { accountId: string; exchangeId: string },
): AccountAuthRecord {
  if (payload.alg !== ALGORITHM || payload.v !== VERSION) {
    throw new Error("Unsupported encrypted account payload");
  }

  const key = deriveKey(getAccountsEncryptionSecret());
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAAD(buildAad(context.accountId, context.exchangeId));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Record<string, unknown>;
  const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey : undefined;
  const apiSecret =
    typeof parsed.apiSecret === "string" ? parsed.apiSecret : undefined;
  const apiPassphrase =
    typeof parsed.apiPassphrase === "string" ? parsed.apiPassphrase : undefined;

  if (!apiKey || !apiSecret) {
    throw new Error("Decrypted account auth payload is incomplete");
  }

  return {
    apiKey,
    apiSecret,
    apiPassphrase,
  };
}
