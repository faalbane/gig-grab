import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { db, candidates, sessions } from "@gig-grab/db";
import { and, eq, gt, inArray } from "drizzle-orm";
import {
  isAllowedLanguage,
  isDialableE164,
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

class BadInput extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function parse(body: IntakeBody) {
  // Employer pipeline shipped (combined_intake / employer_intake prompts,
  // extractEmployerJob, employer-side session.kind). Accept both audiences.
  const audience = body.audience === "employer" ? "employer" : "worker";

  const phone = (body.phone ?? "").replace(/[^\d+]/g, "");
  if (!E164.test(phone)) {
    throw new BadInput("Invalid phone format. Expected E.164, e.g. +447700900123");
  }
  // Block premium-rate / satellite / non-pilot countries before we hit
  // Twilio. Without this an unauthenticated POST to /intake/start can
  // drive expensive calls to attacker-controlled numbers.
  if (!isDialableE164(phone)) {
    throw new BadInput(
      "We can only call UK, Ireland, US, Canada, India, Pakistan and UAE numbers right now.",
    );
  }

  const language = (body.language ?? "en").toLowerCase().slice(0, 10);
  if (!isAllowedLanguage(language)) {
    throw new BadInput(
      "Unsupported language. Pick one from the language list.",
    );
  }

  return { phone, language, audience };
}

// Only block re-triggers while there's a call IN FLIGHT to this number.
// Once Twilio reports a terminal status (no-answer / busy / completed / failed)
// the candidate can immediately retry — common case is "I missed it, call me again."
//
// Stale-session guard: if Twilio's status callback never delivered (signature
// failure during a domain cutover, network blip), a session can stick at
// `ringing` forever and block the user. Treat anything older than 3 min as
// dead and let the retry through.
const STALE_RINGING_MS = 3 * 60_000;
async function checkPhoneRateLimit(phone: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_RINGING_MS);
  const recent = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(candidates, eq(candidates.id, sessions.candidateId))
    .where(
      and(
        eq(candidates.phone, phone),
        inArray(sessions.status, ["ringing", "in_progress"]),
        gt(sessions.startedAt, cutoff),
      ),
    )
    .limit(1);
  return recent.length === 0;
}

async function upsertCandidate(phone: string, language: string) {
  const [row] = await db()
    .insert(candidates)
    .values({ id: randomUUID(), phone, language, applicationsRemaining: 10 })
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
      error: "We're still calling that number — pick up the phone, or wait ~30s for it to time out.",
    });
    return;
  }

  const candidate = await upsertCandidate(parsed.phone, parsed.language);

  const sessionId = randomUUID();
  await db().insert(sessions).values({
    id: sessionId,
    kind:
      parsed.audience === "employer" ? "employer_intake" : "candidate_intake",
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

    const twErr = err as { code?: number; message?: string; status?: number };

    // Twilio error 21216 = "Account not allowed to call …" — trial accounts
    // can only call verified caller IDs. Surface a helpful message so the
    // user (or developer) knows what's going on.
    if (twErr?.code === 21216) {
      res.status(403).json({
        error:
          "This number isn't allowed on our trial Twilio plan yet. Add it to Verified Caller IDs in the Twilio console, or upgrade Twilio to call any number.",
        twilioCode: 21216,
      });
      return;
    }

    // Twilio 21211 = invalid To phone, 21610 = unsubscribed, 21408 = perm denied.
    if ([21211, 21610, 21408].includes(twErr?.code ?? -1)) {
      res.status(400).json({
        error: "We can't reach that number. Double-check the digits or try a different one.",
        twilioCode: twErr.code,
      });
      return;
    }

    res.status(502).json({
      error: "We couldn't place the call. Please try again in a moment.",
      twilioCode: twErr?.code,
    });
  }
}
