import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { db, candidates, sessions } from "@gig-grab/db";
import { and, eq, gt } from "drizzle-orm";
import {
  isAllowedLanguage,
  signSessionToken,
  ipFromRequest,
  checkIpRateLimit,
} from "./security";

type IntakeBody = {
  phone?: string;
  language?: string;
  audience?: "worker" | "employer";
};

const E164 = /^\+[1-9]\d{6,14}$/;
const RATE_LIMIT_WINDOW_MS = 60_000;

class BadInput extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function parse(body: IntakeBody) {
  // Phase 1 only wires the candidate (worker) flow end-to-end. Reject employer
  // here so we don't silently mis-tag sessions until the employer pipeline ships.
  const audience = body.audience === "employer" ? "employer" : "worker";
  if (audience === "employer") {
    throw new BadInput(
      "Employer intake isn't live yet — coming soon.",
      400,
    );
  }

  const phone = (body.phone ?? "").replace(/[^\d+]/g, "");
  if (!E164.test(phone)) {
    throw new BadInput("Invalid phone format. Expected E.164, e.g. +447700900123");
  }

  const language = (body.language ?? "en").toLowerCase().slice(0, 10);
  if (!isAllowedLanguage(language)) {
    throw new BadInput(
      "Unsupported language. Pick one from the language list.",
    );
  }

  return { phone, language, audience };
}

async function checkPhoneRateLimit(phone: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(candidates, eq(candidates.id, sessions.candidateId))
    .where(and(eq(candidates.phone, phone), gt(sessions.startedAt, cutoff)))
    .limit(1);
  return recent.length === 0;
}

async function upsertCandidate(phone: string, language: string) {
  const [row] = await db()
    .insert(candidates)
    .values({ id: randomUUID(), phone, language })
    .onConflictDoUpdate({
      target: candidates.phone,
      set: { language, lastCallAt: new Date() },
    })
    .returning();
  return row;
}

function publicApiBase(): string {
  return (
    process.env.PUBLIC_API_URL ??
    "https://api-353215144615.europe-west2.run.app"
  );
}

export async function intakeStart(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const ip = ipFromRequest(req);
  if (!checkIpRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests. Try again in a minute." });
    return;
  }

  let parsed;
  try {
    parsed = parse(req.body ?? {});
  } catch (err) {
    if (err instanceof BadInput) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: "bad request" });
    return;
  }

  const allowed = await checkPhoneRateLimit(parsed.phone);
  if (!allowed) {
    res.status(429).json({
      error: "Hold on — we already called this number a moment ago.",
    });
    return;
  }

  const candidate = await upsertCandidate(parsed.phone, parsed.language);

  const sessionId = randomUUID();
  await db().insert(sessions).values({
    id: sessionId,
    kind: "candidate_intake",
    candidateId: candidate.id,
    language: parsed.language,
    status: "ringing",
  });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    console.error("Twilio env not set");
    res.status(500).json({ error: "telephony not configured" });
    return;
  }

  const client = twilio(accountSid, authToken);
  const apiBase = publicApiBase();
  try {
    const call = await client.calls.create({
      to: parsed.phone,
      from: fromNumber,
      url: `${apiBase}/twilio/voice/${sessionId}`,
      statusCallback: `${apiBase}/twilio/status/${sessionId}`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 30,
    });
    await db()
      .update(sessions)
      .set({ twilioCallSid: call.sid })
      .where(eq(sessions.id, sessionId));
    res.json({
      sessionId,
      candidateId: candidate.id,
      callSid: call.sid,
      status: "calling",
      // Short-lived HMAC token paired with sessionId. Required for
      // GET /sessions/:id/profile so the UUID alone isn't sufficient access.
      token: signSessionToken(sessionId),
    });
  } catch (err) {
    console.error("Twilio call failed", err);
    await db()
      .update(sessions)
      .set({ status: "failed", endedAt: new Date() })
      .where(eq(sessions.id, sessionId));
    res.status(502).json({
      error: "We couldn't place the call. Please try again in a moment.",
    });
  }
}
