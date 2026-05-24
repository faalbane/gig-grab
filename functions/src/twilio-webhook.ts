import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { db, sessions, candidates } from "@gig-grab/db";
import { and, eq, ne } from "drizzle-orm";
import { extractProfile } from "./profile";
import { extractEmployerJob } from "./employer-extraction";
import {
  classifyAudience,
  persistAudience,
  maybeFlipSessionKind,
} from "./intent";
import { verifyTwilioSignature } from "./security";

/**
 * Kick off dual-channel call recording on a Twilio call.
 * Fire-and-forget — we don't await the response or block the TwiML.
 * Completed-recording webhook (twilioRecordingStatus below) writes the
 * audio URL onto sessions.audio_url.
 */
function startCallRecording(callSid: string, sessionId: string): void {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok || !callSid) return;
  const apiBase =
    process.env.PUBLIC_API_URL ??
    "https://api-353215144615.europe-west2.run.app";
  const body = new URLSearchParams({
    RecordingChannels: "dual",
    RecordingStatusCallback: `${apiBase}/twilio/recording-status/${sessionId}`,
    RecordingStatusCallbackEvent: "completed",
  });
  void fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}/Recordings.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  ).catch((err) => console.error("[recording/start] failed", err));
}

/**
 * Twilio fetches this URL when the candidate picks up the call.
 * Returns TwiML that connects the call to our Pipecat agent's WebSocket.
 *
 * Skip signature verification — Twilio fetches this with our embedded URL
 * and we serve TwiML; no state mutation is performed here that would benefit
 * from rejection. (We do flip `status -> in_progress` but that's idempotent
 * and the only worst case is a noisy log entry from a curious caller.)
 */
export async function twilioVoice(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const [session] = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    twiml.say(
      { voice: "Polly.Joanna" },
      "Sorry, your session has expired. Please go back to the website and try again.",
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  await db()
    .update(sessions)
    .set({ status: "in_progress" })
    .where(eq(sessions.id, sessionId));

  const wsBase = process.env.AGENT_WS_URL;
  if (!wsBase) {
    twiml.say(
      { voice: "Polly.Joanna" },
      "Hi! Thanks for calling GigGrab. Our AI recruiter isn't configured yet. Please try again in a few minutes. Goodbye.",
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // No /healthz pre-flight — used to add ~200ms-1.5s of latency before the
  // candidate heard anything. Agent is stable now; if its WS connect fails
  // Twilio drops to dead air either way.
  // Twilio strips query strings from <Stream url="…"/> on the WebSocket
  // connect URL AND does NOT promote them to customParameters. Use
  // <Parameter> child elements — Twilio delivers them in the start frame's
  // `start.customParameters` field.
  // Tell the agent which system prompt to load based on session.kind set
  // by /intake/start. Employer = employer_intake prompt; otherwise candidate.
  const audience: "worker" | "employer" =
    session.kind === "employer_intake" ? "employer" : "worker";
  const connect = twiml.connect();
  const stream = connect.stream({ url: wsBase });
  stream.parameter({ name: "sessionId", value: sessionId });
  stream.parameter({ name: "language", value: session.language ?? "en" });
  stream.parameter({ name: "audience", value: audience });
  res.type("text/xml").send(twiml.toString());
}

/**
 * Twilio status callback — updates session.status as the call progresses.
 * Verifies X-Twilio-Signature so an attacker who guesses the sessionId
 * can't fake "completed" and trigger the (paid) Claude extraction.
 */
export async function twilioStatus(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  if (!verifyTwilioSignature(req)) {
    console.warn(`[twilio] invalid signature on /twilio/status/${sessionId}`);
    res.status(403).send();
    return;
  }
  await applyTwilioStatus(sessionId, req, res);
}

/**
 * Twilio status callback for INBOUND hotline calls. Twilio's number config
 * fires this without a sessionId in the URL, so we resolve the session by
 * looking up the CallSid from the request body.
 */
export async function twilioInboundStatus(
  req: Request,
  res: Response,
): Promise<void> {
  if (!verifyTwilioSignature(req)) {
    console.warn(`[twilio] invalid signature on /twilio/status (inbound)`);
    res.status(403).send();
    return;
  }
  const callSid = String(req.body?.CallSid ?? "").trim();
  if (!callSid) {
    res.status(400).send();
    return;
  }
  const [s] = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.twilioCallSid, callSid))
    .limit(1);
  if (!s) {
    console.warn(`[twilio/inbound-status] no session for callSid=${callSid}`);
    res.status(204).send();
    return;
  }
  await applyTwilioStatus(s.id, req, res);
}

async function applyTwilioStatus(
  sessionId: string,
  req: Request,
  res: Response,
): Promise<void> {
  const status = (req.body?.CallStatus ?? "") as string;
  const map: Record<string, string> = {
    queued: "ringing",
    initiated: "ringing",
    ringing: "ringing",
    "in-progress": "in_progress",
    completed: "completed",
    busy: "abandoned",
    "no-answer": "abandoned",
    canceled: "abandoned",
    failed: "failed",
  };
  const mapped = map[status];
  let transitioned = false;
  if (mapped) {
    // Idempotent update: only transition from non-terminal → terminal once,
    // so a Twilio retry/replay of a `completed` callback doesn't re-fire
    // the paid extraction below. Drizzle returns the affected rows via
    // .returning() — if empty, we already processed this status.
    const updated = await db()
      .update(sessions)
      .set({
        status: mapped as
          | "ringing"
          | "in_progress"
          | "completed"
          | "abandoned"
          | "failed",
        endedAt:
          mapped === "completed" ||
          mapped === "abandoned" ||
          mapped === "failed"
            ? new Date()
            : undefined,
      })
      .where(
        and(
          eq(sessions.id, sessionId),
          ne(sessions.status, mapped as "completed"),
        ),
      )
      .returning({ id: sessions.id });
    transitioned = updated.length > 0;
  }

  if (mapped === "completed" && transitioned) {
    // Route to the right extractor based on session.kind + cached
    // audience. Look up the row since Twilio's payload doesn't tell us.
    const [row] = await db()
      .select({
        kind: sessions.kind,
        candidateId: sessions.candidateId,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (row?.candidateId) {
      // Always re-classify the transcript on completion. The cached
      // audience + session.kind are HINTS based on prior calls; they
      // can't trump what the caller actually said this time. Skipping
      // this step caused candidate calls from numbers cached as
      // employer to be routed to extractEmployerJob — producing junk
      // job rows instead of profile_cards.
      void (async () => {
        try {
          let audience: "worker" | "employer";
          try {
            audience = await classifyAudience(sessionId);
          } catch (err) {
            console.warn(
              "[extract] classifier failed — falling back to session.kind",
              err,
            );
            audience = row.kind === "employer_intake" ? "employer" : "worker";
          }
          // Persist + flip BEFORE running the extractor so the
          // extractor's own kind-guard (e.g. extractEmployerJob's
          // `session.kind !== 'employer_intake' → skip`) lets it run.
          await persistAudience(row.candidateId!, audience);
          await maybeFlipSessionKind(sessionId, audience);
          if (audience === "employer") {
            await extractEmployerJob(sessionId);
          } else {
            await extractProfile(sessionId);
            // Post-call trust-builder: SMS the caller their top 3
            // matches. Only on candidate calls. Fire-and-forget so a
            // Twilio outage on the SMS leg doesn't block the status
            // callback response. extractProfile already kicked off
            // embedCandidate; await a beat to give it a chance, then
            // try — sendPostCallMatches no-ops if the embedding isn't
            // there yet.
            void (async () => {
              try {
                await new Promise((r) => setTimeout(r, 1500));
                const { sendPostCallMatches } = await import("./post-call-sms");
                const r = await sendPostCallMatches(row.candidateId!);
                console.log(
                  `[post-call-sms] cand=${row.candidateId!.slice(0, 8)} ok=${r.ok} reason=${r.reason ?? ""} sid=${r.sid ?? ""} count=${r.count ?? 0}`,
                );
              } catch (err) {
                console.error("[post-call-sms] failed", err);
              }
            })();
          }
        } catch (err) {
          console.error("[extract] dispatch failed", err);
        }
      })();
    } else {
      // Session has no candidate (shouldn't happen post-inbound, but be
      // defensive). Default to candidate extraction.
      void extractProfile(sessionId).catch((err) =>
        console.error("[extract:profile] failed", err),
      );
    }
  }

  res.status(204).send();
}

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Twilio "A Call Comes In" webhook for the GigGrab hotline. The candidate
 * dialled our number; Twilio POSTs the call metadata here. We register the
 * caller as a candidate (or reuse the row if their phone is already on
 * file), open a session, and return TwiML that streams audio to the agent.
 *
 * Status callbacks for this leg use the per-session URL so the rest of the
 * pipeline (extractProfile + SMS link on completion) is unchanged.
 */
export async function twilioInbound(
  req: Request,
  res: Response,
): Promise<void> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  if (!verifyTwilioSignature(req)) {
    console.warn(`[twilio/inbound] invalid signature`);
    res.status(403).send();
    return;
  }

  const from = String(req.body?.From ?? "").trim();
  const callSid = String(req.body?.CallSid ?? "").trim();
  if (!E164.test(from) || !callSid) {
    console.warn(`[twilio/inbound] bad payload from=${from} callSid=${callSid}`);
    twiml.say(
      { voice: "Polly.Joanna" },
      "Sorry, we couldn't process this call. Please try again later. Goodbye.",
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // Upsert candidate by phone. If they've called before (or onboarded via
  // the web flow), we re-attach to the existing row. We use a candidates
  // row even for employer callers because phone is our universal cache
  // key for "have we seen this number before + what's their intent" —
  // the actual employer record (employers table) is built post-call by
  // extractEmployerJob from the transcript.
  // Default new candidates to English; if a returning caller has a
  // language preference on file, the onConflictDoUpdate keeps it.
  // Seed 10 free applications on first-ever creation (FREE_APPLICATIONS).
  // For returning numbers, do NOT reset the quota — they may already
  // have an active subscription or a partially-used free balance.
  const [candidate] = await db()
    .insert(candidates)
    .values({
      id: randomUUID(),
      phone: from,
      language: "en",
      applicationsRemaining: 10,
    })
    .onConflictDoUpdate({
      target: candidates.phone,
      set: { lastCallAt: new Date() },
    })
    .returning();
  // Honour the caller's stored language preference (set by the web
  // intake flow or last call) so Arabic/Hindi/etc speakers don't get
  // an English call every time. Falls back to "en" for first-time
  // callers — they can switch language via the web /voice flow next
  // time around.
  const callLanguage = candidate.language || "en";

  // Read cached audience from match_signals (set by the post-call
  // classifier the first time someone called). If we don't know yet,
  // audience="unknown" → agent uses the combined intake prompt and asks
  // intent on the call.
  const cachedAudience: "worker" | "employer" | "unknown" =
    candidate.matchSignals?.audience ?? "unknown";

  // Default session.kind to candidate_intake. If the cached audience is
  // employer we know upfront; otherwise the post-call classifier flips
  // session.kind if the transcript indicates an employer call.
  const sessionKind: "candidate_intake" | "employer_intake" =
    cachedAudience === "employer" ? "employer_intake" : "candidate_intake";

  const sessionId = randomUUID();
  await db().insert(sessions).values({
    id: sessionId,
    kind: sessionKind,
    candidateId: candidate.id,
    language: callLanguage,
    status: "ringing",
    twilioCallSid: callSid,
  });

  const wsBase = process.env.AGENT_WS_URL;
  if (!wsBase) {
    twiml.say(
      { voice: "Polly.Joanna" },
      "Sorry, our voice agent isn't reachable right now. Please try again in a few minutes. Goodbye.",
    );
    res.type("text/xml").send(twiml.toString());
    return;
  }

  // Mirror the outbound /twilio/voice TwiML — same agent, same protocol.
  // audience tells the agent which system prompt to load:
  //   worker   → candidate_interview prompt
  //   employer → employer_intake prompt
  //   unknown  → combined_intake prompt (asks intent on first turn)
  const apiBase =
    process.env.PUBLIC_API_URL ??
    "https://api-353215144615.europe-west2.run.app";
  const connect = twiml.connect();
  const stream = connect.stream({ url: wsBase });
  stream.parameter({ name: "sessionId", value: sessionId });
  stream.parameter({ name: "language", value: callLanguage });
  stream.parameter({ name: "audience", value: cachedAudience });
  stream.parameter({ name: "inbound", value: "1" });

  // Kick off dual-channel call recording. Twilio fires
  // /twilio/recording-status/:sessionId on completion which writes the
  // mp3 URL onto sessions.audio_url for the admin transcript viewer.
  startCallRecording(callSid, sessionId);

  // Tell Twilio to POST status updates for this call to the per-session
  // status URL. That triggers extractProfile + SMS on completion.
  // (Configured via the StatusCallback attribute on Twilio's call leg —
  // since the inbound leg is owned by Twilio's number config, the URL
  // here will be set on the number itself once via the Twilio API.)
  void apiBase; // explicit no-op so the const stays referenced

  res.type("text/xml").send(twiml.toString());
}

/**
 * POST /twilio/recording-status/:sessionId — fired by Twilio when a
 * call recording reaches a terminal state. Writes the recording URL
 * onto sessions.audio_url so the admin transcript viewer can offer
 * audio playback.
 */
export async function twilioRecordingStatus(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  if (!verifyTwilioSignature(req)) {
    console.warn(`[twilio/recording-status] invalid sig on ${sessionId}`);
    res.status(403).send();
    return;
  }
  const recordingSid = String(req.body?.RecordingSid ?? "").trim();
  const recordingUrl = String(req.body?.RecordingUrl ?? "").trim();
  const status = String(req.body?.RecordingStatus ?? "").trim();
  if (!recordingSid || status !== "completed") {
    res.status(204).send();
    return;
  }
  // Twilio's RecordingUrl needs `.mp3` appended for audio download.
  const mp3 = `${recordingUrl}.mp3`;
  await db()
    .update(sessions)
    .set({ audioUrl: mp3 })
    .where(eq(sessions.id, sessionId));
  console.log(
    `[recording/saved] session=${sessionId.slice(0, 8)} recording=${recordingSid} url=${mp3}`,
  );
  res.status(204).send();
}
