import { createHmac, timingSafeEqual } from "node:crypto";
import { Request } from "firebase-functions/v2/https";
import twilio from "twilio";

// ---------------------------------------------------------------------------
// Allowed languages — must align with apps/web/src/lib/languages.ts.
// Reject anything else at the API boundary so we never persist garbage that
// would break Cartesia TTS at call time.
// ---------------------------------------------------------------------------

export const ALLOWED_LANGUAGES = new Set([
  "en", "es", "fr", "de", "hi", "pt", "it", "nl", "ja", "ru",
  "pl", "ro", "uk", "ar", "tr", "tl", "zh", "ko", "vi", "ta",
  "te", "bn", "ur", "id", "sv", "da", "no", "fi", "el", "cs",
  "bg", "hr",
]);

export function isAllowedLanguage(code: string): boolean {
  return ALLOWED_LANGUAGES.has(code);
}

// ---------------------------------------------------------------------------
// HMAC session tokens — short-lived, signed identifier paired with a sessionId
// so /api/sessions/:id/profile isn't readable just by guessing/leaking the UUID.
// ---------------------------------------------------------------------------

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

/** Returns a 32-char hex-encoded HMAC-SHA256 prefix of (sessionId|expiry). */
export function signSessionToken(sessionId: string, ttlSeconds = 60 * 60 * 24): string {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${sessionId}.${expiry}`;
  const mac = createHmac("sha256", getSecret()).update(payload).digest("hex").slice(0, 32);
  return `${expiry}.${mac}`;
}

export function verifySessionToken(sessionId: string, token: string): boolean {
  if (!token || !sessionId) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiryStr, mac] = parts;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", getSecret())
    .update(`${sessionId}.${expiry}`)
    .digest("hex")
    .slice(0, 32);
  if (mac.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
}

// ---------------------------------------------------------------------------
// Twilio webhook signature verification.
// Without this, anyone who knows a sessionId can POST status updates and
// trigger the (paid) Claude profile extraction. Twilio signs every webhook
// request with HMAC-SHA1 of (full URL + sorted params) using the auth token.
// ---------------------------------------------------------------------------

export function verifyTwilioSignature(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  const signature = (req.header("X-Twilio-Signature") ?? "") as string;
  if (!signature) return false;

  const fullUrl =
    (process.env.PUBLIC_API_URL ??
      "https://api-353215144615.europe-west2.run.app") +
    req.path;
  const params = (req.body as Record<string, string>) ?? {};
  return twilio.validateRequest(authToken, signature, fullUrl, params);
}

// ---------------------------------------------------------------------------
// Per-IP rate limit (in-memory, per-instance, best-effort).
// Cloud Run autoscales so this won't catch sophisticated distributed attacks,
// but stops casual spam. A persistent table-backed limiter is a Phase 2 task.
// ---------------------------------------------------------------------------

type RateBucket = { count: number; windowStart: number };
const ipBuckets = new Map<string, RateBucket>();
const IP_WINDOW_MS = 60_000;
const IP_MAX_PER_WINDOW = 5;

export function ipFromRequest(req: Request): string {
  const fwd = (req.header("x-forwarded-for") ?? "") as string;
  const ip = fwd.split(",")[0]?.trim() || (req.ip ?? "unknown");
  return ip;
}

export function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > IP_WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= IP_MAX_PER_WINDOW) return false;
  bucket.count++;
  return true;
}

// Periodically prune old buckets so the map doesn't grow unbounded across
// long-lived warm instances.
const PRUNE_INTERVAL_MS = 5 * 60_000;
setInterval(() => {
  const cutoff = Date.now() - IP_WINDOW_MS;
  for (const [ip, b] of ipBuckets.entries()) {
    if (b.windowStart < cutoff) ipBuckets.delete(ip);
  }
}, PRUNE_INTERVAL_MS).unref?.();
