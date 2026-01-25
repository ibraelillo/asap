// Default adapters
import { HttpClient, Logger, TimeProvider, UuidProvider } from "./types.js";
import crypto from "crypto";

export const fetchHttpClient: HttpClient = async (
  method,
  url,
  body,
  headers = {},
) => {
  const resp = await fetch(url, { method, body, headers });
  if (!resp.ok) {
    console.error(await resp.text());
    throw new Error(`HTTP error: ${resp.status}`);
  }
  return resp.json();
};

export const consoleLogger: Logger = {
  info: (msg, meta) => console.log("[INFO]", msg, meta ?? ""),
  warn: (msg, meta) => console.warn("[WARN]", msg, meta ?? ""),
  error: (msg, meta) => console.error("[ERROR]", msg, meta ?? ""),
};

export const systemTime: TimeProvider = () => Date.now();
export const nodeUuid: UuidProvider = () => crypto.randomUUID();
