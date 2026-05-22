import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import {
  db,
  candidates,
  sessions,
  profileCards,
  employers,
  alerts,
  type ProfileProject,
} from "@gig-grab/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { signSessionToken } from "./security";

const E164 = /^\+[1-9]\d{6,14}$/;
const VERIFY_API = "https://verify.twilio.com/v2";

type AuthCtx = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  authTime: number; // seconds since epoch; freshness gate for destructive ops
};

async function decodeBearer(req: Request): Promise<AuthCtx | null> {
  const authz = (req.headers.authorization ?? "") as string;
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) return null;
  try {
    const decoded = await getAuth().verifyIdToken(tok);
    return {
      uid: decoded.uid,
      email: (decoded.email ?? null) as string | null,
      emailVerified: Boolean(decoded.email_verified),
      phone: (decoded.phone_number ?? null) as string | null,
      authTime: Number(decoded.auth_time ?? 0),
    };
  } catch {
    return null;
  }
}

async function findCandidateByUid(uid: string) {
  const [row] = await db()
    .select()
    .from(candidates)
    .where(eq(candidates.firebaseUid, uid))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve the signed-in user to a candidate row. Mirrors authLink's
 * uid → phone → verified-email → stub fallback, so any auth-gated
 * endpoint can self-heal a missing row instead of 404ing. This keeps
 * the dashboard from showing a "no candidate row" error if /auth/link
 * was skipped or raced the first read.
 */
async function ensureCandidateForUid(auth: AuthCtx) {
  let row = await findCandidateByUid(auth.uid);
  if (row) return row;

  if (auth.phone) {
    [row] = await db()
      .update(candidates)
      .set({
        firebaseUid: auth.uid,
        email: auth.emailVerified && auth.email ? auth.email : undefined,
      })
      .where(eq(candidates.phone, auth.phone))
      .returning();
    if (row) return row;
  }

  if (auth.email && auth.emailVerified) {
    const [match] = await db()
      .select()
      .from(candidates)
      .where(eq(candidates.email, auth.email))
      .limit(1);
    // Only silently inherit an email-matched row when it's an unclaimed
    // phone-stub (i.e. a hotline-onboarded user who never finished sign-in).
    // A real-phone unclaimed row with the same email is a different
    // person whose email was extracted from a call transcript — silently
    // claiming would be account takeover.
    if (match) {
      const claimed = match.firebaseUid && match.firebaseUid !== auth.uid;
      const pendingStub = match.phone.startsWith("pending-");
      if (!claimed && (pendingStub || match.firebaseUid === auth.uid)) {
        [row] = await db()
          .update(candidates)
          .set({ firebaseUid: auth.uid })
          .where(eq(candidates.id, match.id))
          .returning();
        if (row) return row;
      } else if (!claimed) {
        console.warn(
          `[account/ensure] email=${auth.email} matched candidate=${match.id} ` +
            `with phone=${match.phone}; refusing silent claim (not a stub)`,
        );
      }
    }
  }

  const id = randomUUID();
  [row] = await db()
    .insert(candidates)
    .values({
      id,
      firebaseUid: auth.uid,
      phone: auth.phone ?? `pending-${id.slice(0, 8)}`,
      email: auth.emailVerified && auth.email ? auth.email : undefined,
      language: "en",
      applicationsRemaining: 10, // free tier
    })
    .returning();
  console.log(
    `[account] stub created uid=${auth.uid.slice(0, 6)} phone=${row.phone}`,
  );
  return row;
}

/**
 * POST /api/sessions/:id/extract-snapshot — run extractProfile mid-call
 * so the /voice CV preview updates in near-real-time as the candidate
 * speaks. Auth: Firebase bearer + session ownership.
 *
 * $-burn guard: extractProfile invokes Claude Sonnet 4.6. The UI
 * self-throttles to every 6 turns + 8 s, but devtools can replay this
 * endpoint at any rate. Per-session in-memory bucket: minimum 5 s
 * between calls + max 30 calls per session lifetime.
 */
type SnapshotBucket = { last: number; count: number };
const snapshotBuckets = new Map<string, SnapshotBucket>();
const SNAPSHOT_MIN_GAP_MS = 5_000;
const SNAPSHOT_MAX_PER_SESSION = 30;

export async function sessionExtractSnapshot(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const candidate = await ensureCandidateForUid(auth);
  const [s] = await db()
    .select({ candidateId: sessions.candidateId, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!s || s.candidateId !== candidate.id) {
    res.status(403).json({ error: "not your session" });
    return;
  }
  // No point burning Anthropic credit on a completed session — the
  // post-call extractor has already run; the live preview UI shouldn't
  // be asking.
  if (s.status === "completed" || s.status === "abandoned" || s.status === "failed") {
    res.status(409).json({ error: "session not live" });
    return;
  }

  const now = Date.now();
  const bucket = snapshotBuckets.get(sessionId) ?? { last: 0, count: 0 };
  if (now - bucket.last < SNAPSHOT_MIN_GAP_MS) {
    res.status(429).json({ error: "snapshot_rate_limited" });
    return;
  }
  if (bucket.count >= SNAPSHOT_MAX_PER_SESSION) {
    res.status(429).json({ error: "snapshot_quota_exceeded" });
    return;
  }
  snapshotBuckets.set(sessionId, { last: now, count: bucket.count + 1 });

  try {
    const { extractProfile } = await import("./profile");
    await extractProfile(sessionId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[snapshot-extract] failed", err);
    res.status(500).json({ error: "extract failed" });
  }
}

/**
 * POST /api/sessions/:id/extract-job-snapshot — employer-side analogue
 * of sessionExtractSnapshot. Returns a transient JobDraft so the live
 * /voice?audience=employer right pane can render the job posting as
 * the employer speaks. No DB writes — final commit happens post-call
 * via extractEmployerJob.
 *
 * Same rate-limit pattern: 5s min gap, 30 per session lifetime, refuses
 * terminal sessions.
 */
const jobSnapshotBuckets = new Map<string, SnapshotBucket>();

export async function sessionExtractJobSnapshot(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const candidate = await ensureCandidateForUid(auth);
  const [s] = await db()
    .select({
      candidateId: sessions.candidateId,
      status: sessions.status,
      kind: sessions.kind,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!s || s.candidateId !== candidate.id) {
    res.status(403).json({ error: "not your session" });
    return;
  }
  if (s.kind !== "employer_intake") {
    res.status(409).json({ error: "not an employer session" });
    return;
  }
  if (s.status === "completed" || s.status === "abandoned" || s.status === "failed") {
    res.status(409).json({ error: "session not live" });
    return;
  }
  const now = Date.now();
  const bucket = jobSnapshotBuckets.get(sessionId) ?? { last: 0, count: 0 };
  if (now - bucket.last < SNAPSHOT_MIN_GAP_MS) {
    res.status(429).json({ error: "snapshot_rate_limited" });
    return;
  }
  if (bucket.count >= SNAPSHOT_MAX_PER_SESSION) {
    res.status(429).json({ error: "snapshot_quota_exceeded" });
    return;
  }
  jobSnapshotBuckets.set(sessionId, { last: now, count: bucket.count + 1 });

  try {
    const { extractJobDraft } = await import("./employer-extraction");
    const draft = await extractJobDraft(sessionId);
    res.json({ ok: true, draft });
  } catch (err) {
    console.error("[snapshot-extract:job] failed", err);
    res.status(500).json({ error: "extract failed" });
  }
}

/**
 * POST /api/account/email — set or update the signed-in candidate's
 * email. Used after the apply flow to collect an email for application
 * status updates without forcing email at sign-in. Idempotent.
 *
 * Hardening: refuse to set an email that already belongs to a different
 * candidate row. Without this check a user could overwrite their email
 * to a victim's address; any downstream lookup keyed on email (employer
 * binding, account merge, alerts) would then return ambiguous rows.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function accountEmailUpdate(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 320) {
    res.status(400).json({ error: "invalid email" });
    return;
  }
  const candidate = await ensureCandidateForUid(auth);

  const [collide] = await db()
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.email, email))
    .limit(1);
  if (collide && collide.id !== candidate.id) {
    res.status(409).json({ error: "email_in_use" });
    return;
  }

  await db()
    .update(candidates)
    .set({ email })
    .where(eq(candidates.id, candidate.id));
  res.json({ ok: true, email });
}

/**
 * PUT /api/account/profile — auth-gated partial update of the signed-in
 * candidate's profile_card. Body accepts any subset of:
 *   name, title, yearsExperience, location, summary,
 *   ticketsAndCards (string[]), recentProjects (ProfileProject[]).
 *
 * Untouched fields are preserved. If no profile_card row exists yet, we
 * upsert one with the candidate's id. Returns the merged row so the UI
 * can swap the local state with the canonical version.
 */
export async function accountProfileUpdate(
  req: Request,
  res: Response,
): Promise<void> {
  const { ensureProfileSchema } = await import("./profile");
  await ensureProfileSchema();
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const candidate = await ensureCandidateForUid(auth);

  const body = (req.body ?? {}) as {
    name?: string;
    title?: string;
    yearsExperience?: number;
    location?: string;
    summary?: string;
    education?: string;
    languagesSpoken?: string[];
    workAuth?: string;
    ticketsAndCards?: string[];
    recentProjects?: ProfileProject[];
  };

  const clean = (v: unknown): string =>
    typeof v === "string" ? v.replace(/\s+$/, "").slice(0, 2000) : "";
  const cleanArr = (xs: unknown): string[] =>
    Array.isArray(xs)
      ? xs
          .map((x) => clean(x))
          .filter((x) => x.length > 0)
          .slice(0, 50)
      : [];
  const cleanProjects = (xs: unknown): ProfileProject[] => {
    if (!Array.isArray(xs)) return [];
    return xs
      .map((p): ProfileProject | null => {
        if (!p || typeof p !== "object") return null;
        const obj = p as Record<string, unknown>;
        const role = clean(obj.role);
        const company = clean(obj.company);
        const period = clean(obj.period);
        const description = clean(obj.description);
        if (!role && !company) return null;
        return { role, company, period, description };
      })
      .filter((p): p is ProfileProject => p !== null)
      .slice(0, 20);
  };

  const [existing] = await db()
    .select()
    .from(profileCards)
    .where(eq(profileCards.candidateId, candidate.id))
    .limit(1);

  const merged = {
    name:
      "name" in body ? clean(body.name) : (existing?.name ?? ""),
    title:
      "title" in body ? clean(body.title) : (existing?.title ?? ""),
    yearsExperience:
      typeof body.yearsExperience === "number" && body.yearsExperience >= 0
        ? Math.floor(body.yearsExperience)
        : (existing?.yearsExperience ?? 0),
    location:
      "location" in body
        ? clean(body.location)
        : (existing?.location ?? ""),
    summary:
      "summary" in body ? clean(body.summary) : (existing?.summary ?? ""),
    education:
      "education" in body ? clean(body.education) : (existing?.education ?? ""),
    languagesSpoken:
      "languagesSpoken" in body
        ? cleanArr(body.languagesSpoken)
        : (existing?.languagesSpoken ?? []),
    workAuth:
      "workAuth" in body ? clean(body.workAuth) : (existing?.workAuth ?? ""),
    ticketsAndCards:
      "ticketsAndCards" in body
        ? cleanArr(body.ticketsAndCards)
        : (existing?.ticketsAndCards ?? []),
    recentProjects:
      "recentProjects" in body
        ? cleanProjects(body.recentProjects)
        : (existing?.recentProjects ?? []),
  };

  // Track every field the user just edited as a manual override so a
  // later transcript snapshot extract doesn't clobber the human edit.
  const overrideFields = [
    "name",
    "title",
    "yearsExperience",
    "location",
    "summary",
    "education",
    "languagesSpoken",
    "workAuth",
    "ticketsAndCards",
    "recentProjects",
  ] as const;
  const manualOverrides = { ...(existing?.manualOverrides ?? {}) };
  for (const f of overrideFields) {
    if (f in body) manualOverrides[f] = true;
  }

  await db()
    .insert(profileCards)
    .values({ candidateId: candidate.id, ...merged, manualOverrides })
    .onConflictDoUpdate({
      target: profileCards.candidateId,
      set: { ...merged, manualOverrides, updatedAt: new Date() },
    });

  // Re-embed in the background so the next employer query reflects
  // the manual edit. Don't block the response.
  void (async () => {
    try {
      const { embedCandidate } = await import("./embeddings");
      await embedCandidate(candidate.id);
    } catch (err) {
      console.error("[embed:candidate] manual-edit failed", err);
    }
  })();

  res.json({
    profile: {
      candidateId: candidate.id,
      ...merged,
      updatedAt: new Date(),
    },
  });
}

/** GET /api/account/me — return the signed-in candidate's profile bits. */
export async function accountMe(req: Request, res: Response): Promise<void> {
  const { ensureProfileSchema } = await import("./profile");
  await ensureProfileSchema();
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const row = await ensureCandidateForUid(auth);
  const [card] = await db()
    .select()
    .from(profileCards)
    .where(eq(profileCards.candidateId, row.id))
    .limit(1);
  res.json({
    candidate: {
      id: row.id,
      phone: row.phone.startsWith("pending-") ? null : row.phone,
      email: row.email ?? null,
      language: row.language,
    },
    profile: card
      ? {
          candidateId: card.candidateId,
          name: card.name,
          title: card.title,
          yearsExperience: card.yearsExperience,
          location: card.location,
          summary: card.summary,
          education: card.education ?? "",
          languagesSpoken: card.languagesSpoken ?? [],
          workAuth: card.workAuth ?? "",
          ticketsAndCards: card.ticketsAndCards ?? [],
          recentProjects: card.recentProjects ?? [],
          updatedAt: card.updatedAt,
        }
      : null,
  });
}

/**
 * POST /api/account/web-call/start
 *
 * Auth: Firebase ID token. Mints a candidate_intake session and returns the
 * agent WebSocket URL + session HMAC token so the browser can connect mic
 * audio directly to the agent. No Twilio involved.
 */
export async function accountWebCallStart(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const candidate = await ensureCandidateForUid(auth);

  const rawLanguage = String(req.body?.language ?? candidate.language ?? "en")
    .toLowerCase()
    .slice(0, 10);
  const { isAllowedLanguage } = await import("./security");
  const language = isAllowedLanguage(rawLanguage) ? rawLanguage : "en";
  const audience =
    (req.body?.audience ?? "worker") === "employer" ? "employer" : "worker";
  const sessionId = randomUUID();
  await db().insert(sessions).values({
    id: sessionId,
    kind: audience === "employer" ? "employer_intake" : "candidate_intake",
    candidateId: candidate.id,
    language,
    status: "ringing",
  });

  // Browser connects to the agent's web-ws endpoint. The HMAC token isn't
  // strictly used by the agent yet (it just verifies session existence) but
  // it's already required by /sessions/:id/status + /turns for live UI.
  const agentBase =
    process.env.AGENT_WS_URL?.replace(/\/ws$/, "") ??
    "wss://gig-grab.onrender.com";
  const wsUrl =
    `${agentBase}/web-ws?sessionId=${encodeURIComponent(sessionId)}` +
    `&language=${encodeURIComponent(language)}` +
    `&audience=${encodeURIComponent(audience)}`;

  res.json({
    sessionId,
    candidateId: candidate.id,
    wsUrl,
    token: signSessionToken(sessionId),
  });
}

/**
 * DELETE /api/account — purge the signed-in user's full footprint, both
 * candidate-side and employer-side, so they can re-onboard fresh as either
 * audience reusing the same phone or email.
 *
 * What gets wiped:
 *   - candidates row (cascade: profile_cards, sessions, transcript_turns,
 *     matches, interviews, auto_apply_rules)
 *   - alerts rows for this candidate (explicit hard-delete; schema FK is
 *     set-null but payload jsonb retains PII)
 *   - employers rows linked via any of this user's sessions OR via the
 *     verified email (cascade: jobs, ats_connections, employer-side
 *     sessions, alerts.employer_id set-null)
 *   - Firebase Auth user
 *
 * Auth gates:
 *   - Bearer Firebase ID token
 *   - auth_time within last 5 minutes (re-auth freshness — Firebase ID
 *     tokens live up to 1 h; an attacker who steals one shouldn't be able
 *     to nuke the account silently)
 *   - candidate row must match auth.email OR auth.phone (defense in
 *     depth against a stale firebase_uid linkage pointing to someone
 *     else's row)
 *
 * Order: Firebase Auth user deleted FIRST. If that fails, DB is untouched
 * and the user is still signed in. If DB delete then fails, orphaned
 * rows are recoverable but no live uid points at them. Reverse order
 * would leave the user signed in to an empty account on partial failure.
 */
const DELETE_REAUTH_WINDOW_SEC = 5 * 60;

export async function accountDelete(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (auth.authTime === 0 || nowSec - auth.authTime > DELETE_REAUTH_WINDOW_SEC) {
    res.status(401).json({
      error: "reauth_required",
      message: "Please sign in again, then retry deleting your account.",
    });
    return;
  }

  const row = await findCandidateByUid(auth.uid);
  if (row) {
    // Defense in depth: a future bug in phone/email linking could leave a
    // uid pointing at the wrong candidate row. Refuse delete unless the
    // verified contact actually matches.
    const emailMatch =
      auth.emailVerified &&
      !!auth.email &&
      !!row.email &&
      row.email.toLowerCase() === auth.email.toLowerCase();
    const phoneMatch = !!auth.phone && !!row.phone && row.phone === auth.phone;
    if (!emailMatch && !phoneMatch) {
      console.warn(
        `[account/delete] identity mismatch uid=${auth.uid.slice(0, 6)} ` +
          `candidate=${row.id} — refusing delete`,
      );
      res.status(403).json({ error: "identity_mismatch" });
      return;
    }
  }

  // Resolve every employer this user is on the hook for. Two sources:
  //   (a) sessions.employerId for sessions owned by this candidate
  //   (b) employers.email matching the verified email (covers cases
  //       where the employer row was created on a session that has
  //       since been deleted, or pre-existed the candidate row)
  const employerIds = new Set<string>();
  if (row) {
    const sessRows = await db()
      .select({ eid: sessions.employerId })
      .from(sessions)
      .where(
        and(eq(sessions.candidateId, row.id), isNotNull(sessions.employerId)),
      );
    for (const r of sessRows) if (r.eid) employerIds.add(r.eid);
  }
  if (auth.emailVerified && auth.email) {
    const emRows = await db()
      .select({ id: employers.id })
      .from(employers)
      .where(eq(employers.email, auth.email));
    for (const r of emRows) employerIds.add(r.id);
  }

  // Firebase Auth FIRST — see header comment for ordering rationale.
  try {
    await getAuth().deleteUser(auth.uid);
  } catch (err) {
    const e = err as { code?: string };
    if (e?.code !== "auth/user-not-found") {
      console.error("[account/delete] firebase auth delete failed", err);
      res.status(500).json({ error: "auth_delete_failed" });
      return;
    }
  }

  // From here on we're committed — log so a partial failure is recoverable.
  console.log(
    `[account/delete] uid=${auth.uid.slice(0, 6)} ` +
      `candidate=${row?.id ?? "none"} ` +
      `phone=${row?.phone ?? "none"} ` +
      `employers=[${[...employerIds].join(",")}] ` +
      `at=${new Date().toISOString()}`,
  );

  if (row) {
    // alerts.payload jsonb contains PII (name, role, transcript snippets).
    // Schema FK is set-null which keeps the payload alive — explicit
    // delete for GDPR right-to-erasure compliance.
    await db().delete(alerts).where(eq(alerts.candidateId, row.id));
  }

  if (employerIds.size > 0) {
    await db().delete(employers).where(inArray(employers.id, [...employerIds]));
  }

  if (row) {
    await db().delete(candidates).where(eq(candidates.id, row.id));
  }

  res.json({ ok: true });
}

/** POST /api/account/phone/start { phone } — kick a Twilio Verify SMS code. */
export async function accountPhoneStart(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const phone = (req.body?.phone ?? "").replace(/[^\d+]/g, "");
  if (!E164.test(phone)) {
    res.status(400).json({ error: "phone must be E.164 like +14155551234" });
    return;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const svc = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !tok || !svc) {
    res.status(500).json({ error: "twilio verify not configured" });
    return;
  }

  const body = new URLSearchParams({ To: phone, Channel: "sms" });
  const r = await fetch(`${VERIFY_API}/Services/${svc}/Verifications`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!r.ok) {
    const detail = await r.text();
    console.error(`[verify/start] ${r.status} ${detail}`);
    res.status(502).json({ error: "couldn't start verification" });
    return;
  }
  res.json({ status: "pending" });
}

/** POST /api/account/phone/confirm { phone, code } — verify code, update candidate. */
export async function accountPhoneConfirm(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const phone = (req.body?.phone ?? "").replace(/[^\d+]/g, "");
  const code = String(req.body?.code ?? "").replace(/\D/g, "");
  if (!E164.test(phone) || !/^\d{4,8}$/.test(code)) {
    res.status(400).json({ error: "bad phone or code" });
    return;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const svc = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !tok || !svc) {
    res.status(500).json({ error: "twilio verify not configured" });
    return;
  }

  const body = new URLSearchParams({ To: phone, Code: code });
  const r = await fetch(`${VERIFY_API}/Services/${svc}/VerificationCheck`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await r.json()) as { status?: string };
  if (!r.ok || json.status !== "approved") {
    res.status(400).json({ error: "code didn't verify" });
    return;
  }

  // Self-heal: ensure the signed-in uid has a candidate row, then proceed
  // with the phone-verify + MERGE-on-collision logic below.
  const existing = await ensureCandidateForUid(auth);

  // Does another row already own this phone (typically from a prior
  // hotline call before the user ever signed in)?
  const [collide] = await db()
    .select()
    .from(candidates)
    .where(eq(candidates.phone, phone))
    .limit(1);

  if (collide && collide.id !== existing.id) {
    if (collide.firebaseUid && collide.firebaseUid !== auth.uid) {
      // Someone else's account — refuse.
      res
        .status(409)
        .json({ error: "phone already linked to another account" });
      return;
    }

    // Unclaimed (or already ours) → MERGE. The collide row is the prior
    // hotline row carrying profile_card + sessions; the existing row is
    // the stub created at sign-in. Claim the hotline row with this uid
    // (carrying over email if the stub had one and it didn't), then
    // delete the stub. profile_cards.candidate_id and sessions.candidate_id
    // already point at the surviving row, so nothing else to rewrite.
    await db()
      .update(candidates)
      .set({
        firebaseUid: auth.uid,
        email: collide.email ?? existing.email ?? undefined,
      })
      .where(eq(candidates.id, collide.id));
    await db().delete(candidates).where(eq(candidates.id, existing.id));
    console.log(
      `[account/phone/confirm] merged stub=${existing.id} into hotline=${collide.id} uid=${auth.uid}`,
    );
    res.json({ ok: true, phone, merged: true, candidateId: collide.id });
    return;
  }

  // No collide (or collide IS our own row already) → just write phone.
  await db()
    .update(candidates)
    .set({ phone })
    .where(eq(candidates.id, existing.id));

  res.json({ ok: true, phone });
}
