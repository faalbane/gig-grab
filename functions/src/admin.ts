import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { db, candidates, sessions } from "@gig-grab/db";
import { eq } from "drizzle-orm";
import { extractProfile } from "./profile";
import { extractEmployerJob } from "./employer-extraction";
import {
  classifyAudience,
  persistAudience,
  maybeFlipSessionKind,
} from "./intent";

// Per-session in-memory cooldown for /admin/rerun-extract. Cloud Run
// horizontal scale means this isn't bulletproof — but limits a leaked
// INGEST_SECRET to N×(sessions/hour) extractions across N instances
// rather than unlimited.
const rerunCooldowns = new Map<string, number>();
const RERUN_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * POST /api/admin/rerun-extract/:sessionId
 *
 * Re-runs the post-call extraction pipeline for a session. Useful when the
 * original Twilio status callback hit a mismatched URL and the extract
 * never ran, or when a transient Anthropic failure dropped the result.
 *
 * Auth: shared INGEST_SECRET in `x-ingest-secret` header (same one as the
 * Adzuna ingest endpoint). Not for end-user traffic.
 */
export async function adminRerunExtract(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }

  const [row] = await db()
    .select({
      kind: sessions.kind,
      candidateId: sessions.candidateId,
      status: sessions.status,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  // Only completed sessions are worth re-extracting. Running on
  // in-progress / ringing sessions is paid Anthropic work that the
  // post-call dispatcher will redo anyway.
  if (!row.endedAt || row.status === "ringing" || row.status === "in_progress") {
    res.status(409).json({ error: "session not completed" });
    return;
  }
  // Per-session cooldown: at most one rerun per hour. Defends against an
  // INGEST_SECRET leak being replayed to fan out paid extractions.
  const cooldown = rerunCooldowns.get(sessionId) ?? 0;
  if (Date.now() - cooldown < RERUN_COOLDOWN_MS) {
    res.status(429).json({ error: "rerun_cooldown" });
    return;
  }
  rerunCooldowns.set(sessionId, Date.now());

  try {
    if (row.kind === "employer_intake") {
      await extractEmployerJob(sessionId);
      res.json({ ok: true, mode: "employer_intake" });
      return;
    }

    if (!row.candidateId) {
      await extractProfile(sessionId);
      res.json({ ok: true, mode: "candidate_intake_no_cand" });
      return;
    }

    const [cand] = await db()
      .select({ matchSignals: candidates.matchSignals })
      .from(candidates)
      .where(eq(candidates.id, row.candidateId))
      .limit(1);
    const cached = cand?.matchSignals?.audience;
    let audience: "worker" | "employer";
    if (cached === "worker" || cached === "employer") {
      audience = cached;
    } else {
      audience = await classifyAudience(sessionId);
      await persistAudience(row.candidateId, audience);
      await maybeFlipSessionKind(sessionId, audience);
    }
    if (audience === "employer") {
      await extractEmployerJob(sessionId);
    } else {
      await extractProfile(sessionId);
    }
    res.json({ ok: true, mode: audience });
  } catch (err) {
    console.error("[admin/rerun-extract] failed", err);
    res.status(500).json({ error: "extraction failed" });
  }
}
