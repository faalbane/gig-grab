import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { db, candidates } from "@gig-grab/db";
import { eq } from "drizzle-orm";

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
  res.json({
    candidate: {
      id: row.id,
      phone: row.phone.startsWith("pending-") ? null : row.phone,
      email: row.email ?? null,
      language: row.language,
    },
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

  // Find or claim the candidate row, then write the verified phone.
  const [existing] = await db()
    .select()
    .from(candidates)
    .where(eq(candidates.firebaseUid, auth.uid))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "no candidate row to update" });
    return;
  }

  // If another candidate already has this phone, refuse to overwrite.
  const [collide] = await db()
    .select({ id: candidates.id, firebaseUid: candidates.firebaseUid })
    .from(candidates)
    .where(eq(candidates.phone, phone))
    .limit(1);
  if (collide && collide.id !== existing.id) {
    res.status(409).json({ error: "phone already linked to another account" });
    return;
  }

  await db()
    .update(candidates)
    .set({ phone })
    .where(eq(candidates.id, existing.id));

  res.json({ ok: true, phone });
}
