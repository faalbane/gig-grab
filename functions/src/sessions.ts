import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { db, sessions, transcriptTurns } from "@gig-grab/db";
import { eq, asc, gte, and } from "drizzle-orm";
import { verifySessionToken } from "./security";

/**
 * GET /api/sessions/:id/status
 *
 * Lightweight, polled at ~1 Hz from the /calling UI to drive the
 * ringing → in_progress → completed transitions and auto-redirect to
 * /profile when the call ends. Token-protected (HMAC matches sessionId).
 */
export async function sessionStatusGet(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const token = (req.query.token as string | undefined) ?? "";
  if (!verifySessionToken(sessionId, token)) {
    res.status(401).json({ error: "invalid or missing session token" });
    return;
  }

  const [s] = await db()
    .select({
      id: sessions.id,
      status: sessions.status,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!s) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  res.json(s);
}

/**
 * GET /api/sessions/:id/turns?since=N
 *
 * Returns transcript turns with ord >= since, ordered ascending. UI polls
 * this every ~1s while the call is live; on each poll it updates `since`
 * to the highest ord it has, so we only ship deltas.
 */
export async function sessionTurnsGet(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const token = (req.query.token as string | undefined) ?? "";
  if (!verifySessionToken(sessionId, token)) {
    res.status(401).json({ error: "invalid or missing session token" });
    return;
  }
  const sinceRaw = req.query.since as string | undefined;
  const since = sinceRaw && /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : 0;

  const turns = await db()
    .select()
    .from(transcriptTurns)
    .where(
      and(
        eq(transcriptTurns.sessionId, sessionId),
        gte(transcriptTurns.ord, since),
      ),
    )
    .orderBy(asc(transcriptTurns.ord));

  res.json({
    sessionId,
    since,
    turns: turns.map((t) => ({
      ord: t.ord,
      speaker: t.speaker,
      text: t.text,
      msOffset: t.msOffset,
    })),
  });
}
