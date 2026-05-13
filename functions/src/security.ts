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
// E.164 toll-fraud guard.
//
// /intake/start dials whatever phone the client sends. Without a country-code
// allowlist + premium-prefix denylist an attacker can drive paid calls to
// satellite (+882, +883, +979), premium-rate (+1900, +44(70|9..), African
// premium ranges), or personal/forwarded numbers — Twilio bills us. The
// allowlist covers the markets we actually serve for pilot; expand
// deliberately as we open new ones.
// ---------------------------------------------------------------------------

// Country calling codes we will actively dial. Pilot scope: UK + Ireland +
// North America (US/CA share +1).
const ALLOWED_CALLING_CODES = new Set(["44", "353", "1"]);

// Hard-block prefixes that are billable but never legitimate for hiring
// outreach: satellite, premium-rate, personal/forwarding ranges, audio-text.
// Patterns match the LEADING digits of the E.164 (excluding the +).
const DENY_PREFIXES = [
  // Global premium / satellite
  "881", // Global Mobile Satellite
  "882", // International Networks (Thuraya etc.)
  "883", // International Networks
  "979", // International premium audio-text
  // NANP premium / NANP non-geographic
  "1900",
  "1976",
  // UK premium / personal-numbering / chargeable
  "4470", // Personal numbering (forwards to anything)
  "4476", // Pagers / FCS
  "4487", // Premium audio-text
  "4490", // Premium audio-text (historical)
  "4491", // Premium audio-text
  "4498", // Premium audio-text
  "4499", // Premium audio-text
  "4409", // Premium-rate
];

export function isDialableE164(phone: string): boolean {
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return false;
  const digits = phone.slice(1);
  for (const deny of DENY_PREFIXES) {
    if (digits.startsWith(deny)) return false;
  }
  for (const cc of ALLOWED_CALLING_CODES) {
    if (digits.startsWith(cc)) return true;
  }
  return false;
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

  const params = (req.body as Record<string, string>) ?? {};

  // Twilio signs the URL it was configured to call. We can be reached via:
  //  • Outbound (calls/SMS we initiate) — code uses the Cloud Run URL:
  //    https://api-353215144615.europe-west2.run.app/twilio/<...>
  //  • Inbound hotline / status callback — Twilio number config points at
  //    Firebase Hosting which rewrites to Cloud Run. During the
  //    gitgrab.io → giggrab.io cutover, Twilio may sign either URL
  //    depending on what's configured in the Twilio Console at the
  //    moment of the request. Validate against ALL bases.
  // After the Hosting rewrite, req.path on Cloud Run can either include
  // or omit the leading "/api" depending on Functions Gen version. Build
  // every plausible URL and accept any signature match.
  const apiBase =
    process.env.PUBLIC_API_URL ??
    "https://api-353215144615.europe-west2.run.app";
  const primaryWebBase = process.env.PUBLIC_WEB_URL ?? "https://giggrab.io";
  // Transitional fallback set. Kept until 1 week after the Twilio
  // Console URL flip is verified clean — then we drop gitgrab.io and
  // gig-grab.web.app from the candidate set.
  const legacyWebBases = [
    "https://gitgrab.io",
    "https://gig-grab.web.app",
  ];
  const webBases = new Set<string>([primaryWebBase, ...legacyWebBases]);
  const raw = req.path; // could be "/twilio/inbound" or "/api/twilio/inbound"
  const stripped = raw.replace(/^\/api(?=\/|$)/, ""); // always without /api
  const candidates = new Set<string>([
    `${apiBase}${stripped}`,
    `${apiBase}${raw}`,
  ]);
  for (const webBase of webBases) {
    candidates.add(`${webBase}/api${stripped}`);
    candidates.add(`${webBase}${raw}`);
  }

  for (const url of candidates) {
    if (twilio.validateRequest(authToken, signature, url, params)) return true;
  }
  console.warn(
    `[twilio/sig] no candidate matched. raw=${raw} stripped=${stripped} sig=${signature.slice(0, 8)}…`,
  );
  return false;
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
  // X-Forwarded-For is client-controllable on the LEFTMOST entry. Behind
  // Firebase Hosting + Cloud Run the trusted hop appends to the right.
  // Use the rightmost entry, falling back to req.ip if XFF missing.
  const fwd = (req.header("x-forwarded-for") ?? "") as string;
  const hops = fwd
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return hops[hops.length - 1] || req.ip || "unknown";
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
