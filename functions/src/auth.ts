import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { db, candidates } from "@gig-grab/db";
import { eq, sql } from "drizzle-orm";

/**
 * POST /auth/link — verify Firebase ID token (from `Authorization: Bearer …`)
 * and link the Firebase UID + email to a candidate row.
 *
 * Matching strategy (in order):
 *   1. Body candidateId: only if the row's firebaseUid is null OR matches the
 *      caller. (Prevents claiming someone else's profile by guessing UUIDs.)
 *   2. Verified phone in token: phone-provider sign-ins always verify.
 *   3. Verified email in token: only if `decoded.email_verified` is true.
 *   4. Fallback: create a stub candidate.
 */
export async function authLink(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const authz = (req.headers.authorization ?? "") as string;
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch (err) {
    console.warn("auth/link: invalid token", err);
    res.status(401).json({ error: "invalid token" });
    return;
  }

  const uid = decoded.uid;
  const email = (decoded.email ?? null) as string | null;
  const emailVerified = Boolean(decoded.email_verified);
  // Firebase phone provider always returns a verified phone, so existence
  // is sufficient. For other providers, phone_number is undefined.
  const phone = (decoded.phone_number ?? null) as string | null;
  const candidateId =
    (req.body?.candidateId as string | undefined) ?? null;

  const provider = decoded.firebase?.sign_in_provider ?? "?";
  console.log(
    `[auth/link] decoded uid=${uid} provider=${provider} phone=${phone} email=${email} emailVerified=${emailVerified} candidateId=${candidateId}`,
  );

  let row;

  // 0) Already-claimed shortcut: if a candidate row already has this uid,
  // return it. This recovers cleanly when path 2 / 3 below run on a row
  // that's already linked, AND it's the path /api/account/me will agree
  // with on subsequent reads.
  {
    const [byUid] = await db()
      .select()
      .from(candidates)
      .where(eq(candidates.firebaseUid, uid))
      .limit(1);
    if (byUid) {
      row = byUid;
      console.log(`[auth/link] path 0 (uid match) → ${row.id}`);
    }
  }

  // 1) Explicit candidateId — must not be claimed by a different uid.
  if (candidateId) {
    const [existing] = await db()
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);
    if (existing && existing.firebaseUid && existing.firebaseUid !== uid) {
      res.status(403).json({ error: "candidate already claimed" });
      return;
    }
    if (existing) {
      [row] = await db()
        .update(candidates)
        .set({
          firebaseUid: uid,
          email: emailVerified && email ? email : existing.email ?? undefined,
        })
        .where(eq(candidates.id, candidateId))
        .returning();
    }
  }

  // 2) Verified phone match.
  if (!row && phone) {
    [row] = await db()
      .update(candidates)
      .set({
        firebaseUid: uid,
        email: emailVerified && email ? email : undefined,
      })
      .where(eq(candidates.phone, phone))
      .returning();
    console.log(`[auth/link] path 2 (phone match) → ${row?.id ?? "no match"}`);
  }

  // 3) Verified email match — only if no phone path landed.
  if (!row && email && emailVerified) {
    const [match] = await db()
      .select()
      .from(candidates)
      .where(sql`${candidates.email} = ${email}`)
      .limit(1);
    if (match && (!match.firebaseUid || match.firebaseUid === uid)) {
      [row] = await db()
        .update(candidates)
        .set({ firebaseUid: uid })
        .where(eq(candidates.id, match.id))
        .returning();
    }
  }

  if (!row) {
    const id = crypto.randomUUID();
    [row] = await db()
      .insert(candidates)
      .values({
        id,
        firebaseUid: uid,
        phone: phone ?? `pending-${id.slice(0, 8)}`,
        email: emailVerified && email ? email : undefined,
        language: "en",
      })
      .returning();
    console.log(`[auth/link] fallback created → ${row.id} phone=${row.phone}`);
  }

  res.json({
    candidate: { id: row.id, phone: row.phone, email: row.email ?? null },
  });
}
