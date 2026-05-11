import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import {
  db,
  candidates,
  sessions,
  profileCards,
  type ProfileProject,
} from "@gig-grab/db";
import { eq } from "drizzle-orm";
import { signSessionToken } from "./security";

const E164 = /^\+[1-9]\d{6,14}$/;
const VERIFY_API = "https://verify.twilio.com/v2";

async function decodeBearer(req: Request): Promise<{ uid: string } | null> {
  const authz = (req.headers.authorization ?? "") as string;
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) return null;
  try {
    const decoded = await getAuth().verifyIdToken(tok);
    return { uid: decoded.uid };
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
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const candidate = await findCandidateByUid(auth.uid);
  if (!candidate) {
    res.status(404).json({ error: "no candidate row" });
    return;
  }

  const body = (req.body ?? {}) as {
    name?: string;
    title?: string;
    yearsExperience?: number;
    location?: string;
    summary?: string;
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
    ticketsAndCards:
      "ticketsAndCards" in body
        ? cleanArr(body.ticketsAndCards)
        : (existing?.ticketsAndCards ?? []),
    recentProjects:
      "recentProjects" in body
        ? cleanProjects(body.recentProjects)
        : (existing?.recentProjects ?? []),
  };

  await db()
    .insert(profileCards)
    .values({ candidateId: candidate.id, ...merged })
    .onConflictDoUpdate({
      target: profileCards.candidateId,
      set: { ...merged, updatedAt: new Date() },
    });

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
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const row = await findCandidateByUid(auth.uid);
  if (!row) {
    res.status(404).json({ error: "no candidate row" });
    return;
  }
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
  let candidate = await findCandidateByUid(auth.uid);
  if (!candidate) {
    // Lazy-create a stub if the user hit /voice before any other onboarding.
    const id = randomUUID();
    [candidate] = await db()
      .insert(candidates)
      .values({
        id,
        firebaseUid: auth.uid,
        phone: `pending-${id.slice(0, 8)}`,
        language: "en",
      })
      .returning();
  }

  const language = (req.body?.language ?? candidate.language ?? "en") as string;
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

  // Find the candidate row the signed-in uid is currently bound to.
  const [existing] = await db()
    .select()
    .from(candidates)
    .where(eq(candidates.firebaseUid, auth.uid))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "no candidate row to update" });
    return;
  }

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
