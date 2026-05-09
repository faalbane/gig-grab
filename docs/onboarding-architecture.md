# Onboarding architecture — three paths, one candidate

## Goal

A worker should be able to start a Gig-grab profile through whichever path
suits them. All three end at the same place: a profile_card row + a phone-
linked Firebase Auth identity + a CV they can apply to jobs with.

## The three onboarding paths

| Path | Trigger | Delivery |
|---|---|---|
| **A. Outbound (today)** | Web form: `/start` → enter phone → submit | Twilio places an outbound call to the candidate. Agent runs the 8-question intake. Candidate's browser is on `/calling` watching live transcript, auto-redirects to `/profile` when call ends. |
| **B. Inbound hotline (NEW — Phase 1)** | Candidate dials our Twilio number directly | Twilio's "A Call Comes In" webhook lands at `POST /api/twilio/inbound`. We use Caller ID as the candidate phone, create or reuse the row, return TwiML `<Connect><Stream>` to the agent. After hangup we send an SMS with the `/profile?token=…` link. |
| **C. Web mic in-browser (NEW — Phase 2)** | Web button on `/start`: "Use your microphone" | Browser captures mic → WebSocket to agent (new `/web-ws` endpoint) → same Pipecat pipeline, no Twilio. Agent's audio plays in `<audio>` element. Same conversation, same DB writes, same `/profile` outcome. Replaces or complements the outbound call when the candidate is at a desk and prefers it. |

All three converge on the same backend logic: `extractProfile(sessionId)` →
`profile_cards` row → SMS link.

## Data model — already supports it

- `candidates.phone` (unique, NOT NULL) — primary join key for "did this
  person already onboard?"
- `candidates.firebase_uid` (unique, nullable) — gets set when the
  candidate signs in. `auth/link` already matches phone-verified Firebase
  UID against an existing candidate row (path 2 in `functions/src/auth.ts`).
- `sessions.kind = 'candidate_intake'` — used for all three paths; we add
  `sessions.source` later if reporting needs it (default `web`).

When a hotline caller logs in later via `/auth` with the same phone, the
phone-match path attaches their Firebase UID to the existing row and they
see their profile immediately.

## Phase 1 — Inbound hotline (this turn)

### API

`POST /api/twilio/inbound` (Twilio "A Call Comes In" voice webhook):
1. Validate Twilio signature.
2. Read `From` (caller E.164) + `CallSid` from form body.
3. Upsert candidate by phone. If already exists, reuse `id`. Default
   `language='en'` for a brand new row — agent first turn asks them what
   language they prefer.
4. Insert `sessions` row: `kind='candidate_intake'`, `language='en'`,
   `status='ringing'`, `twilio_call_sid=<CallSid>`.
5. Return TwiML:
   ```xml
   <Response>
     <Connect>
       <Stream url="wss://gig-grab.onrender.com/ws">
         <Parameter name="sessionId" value="…"/>
         <Parameter name="language" value="en"/>
         <Parameter name="audience" value="worker"/>
         <Parameter name="inbound" value="1"/>
       </Stream>
     </Connect>
   </Response>
   ```

### Agent

System prompt is voice-aware — no change needed. The kickoff for inbound
calls instructs the agent to also ask the candidate's preferred language
in the very first turn (instead of trusting the form's `language=en`).

### Twilio configuration

Set the voice number's "A Call Comes In" → HTTP POST →
`https://gig-grab.web.app/api/twilio/inbound`.

I'll do this via Twilio API (we have credentials) so it's reproducible.

### Web — show the hotline

Hero block gets a small "Or just call us — `+1 …`" line beneath the CTAs.
Phone number comes from a public env var so it's swappable without code.

## Phase 2 — Web mic (separate session)

Out of scope for this turn. Sketch only:
- New `/web-ws` route on the agent reads PCM audio frames over WS instead
  of Twilio Media Streams ulaw. Pipecat has a `BrowserAudioFrameSerializer`-
  equivalent we'd use.
- Browser uses `getUserMedia` + `MediaRecorder` or raw `AudioWorklet` to
  stream PCM up; plays agent audio via `<audio>` or Web Audio API.
- Auth token rather than HMAC session token (we'll require sign-in first
  for browser onboarding).

## Phase 3 — Apply with resume (separate session)

- `profile_cards` becomes the user's CV. Already happening.
- Need a "Render PDF" endpoint (`GET /api/sessions/:id/cv.pdf` token-gated)
  for "Apply" actions to attach.
- Apply flow itself depends on the employer side / matching engine, which
  is its own track.

## Sequencing

1. **This turn:** Phase 1 — inbound hotline (api route + Twilio config +
   home-page hotline link). Test with an inbound call.
2. **Next session:** Phase 2 — browser mic flow.
3. **Then:** Phase 3 — PDF rendering + apply flow.

This keeps each push narrow, testable, and safely deployable.
