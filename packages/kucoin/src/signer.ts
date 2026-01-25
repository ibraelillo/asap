import crypto from "crypto";

// ---------- Helpers ----------
export const signRequest = (
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp: string,
) => {
  const what = timestamp + method.toUpperCase() + path + (body || "");
  const hmac = crypto.createHmac("sha256", secret);
  return hmac.update(what).digest("base64");
};
