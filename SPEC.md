# Gig-grab — Product & Engineering Spec

> Voice-first AI hiring agent. Speak it. Match it. Get hired.
>
> Last updated: 2026-05-03

## 1. What we are (and aren't)

**We are:** an AI hiring automation layer. Candidates speak; AI extracts intent, structures it, matches them to live roles, auto-applies, and arranges interviews. Employers describe roles by voice, JD, link, or ATS — we source, match, screen, schedule.

**We are not:** a job board. We don't compete with Indeed or LinkedIn. We don't ask candidates to fill forms or browse listings. Employers do not "post" jobs to a marketplace.

**We optimise for:** time-to-hire and conversion-to-hire. Job boards optimise for traffic.

## 2. Two flows

### 2.1 Candidate flow

| # | Stage | Action | Logic |
|---|---|---|---|
| 1 | Landing | "Speak it. Match it. Get hired." | "Find work in 3 simple steps" — Speak / Get matched / Apply or auto-apply |
| 2 | Verify | Phone + language (30+) | "Speak any language" callout; consent checkbox; CTA reads "Call me in {language}" |
| 3 | Voice call (~2 min) | Structured AI interview, **8 question categories** | Language & name · Your trade · Certs & tickets · Recent work · Location & travel · Availability · Pay expectation · Deal-breakers |
| 4 | Profile | **Two-pane: Conversation + live CV preview** | Editable chat on left rebuilds rendered CV on right in real time; CTAs: Call again / Import LinkedIn / Upload CV / See matches |
| 5 | Auth | Google / LinkedIn / email | "Where should we send everything?" — captured AFTER value |
| 6 | Dashboard | Top matches with filter chips | `Any role` `Remote or UK` `Start in 2 weeks` `Full-time`; per-job Apply + star (save) |
| 7 | **Auto-apply** | Right-rail card: pay floor, commute, shift type | Background bot applies on candidate's behalf — *headline differentiator* |
| 8 | Alerts | SMS / WhatsApp / email | When top match appears or employer responds |
| | Profile gamification | Profile strength % · New matches today · Recruiters viewed | Right rail of dashboard |

**Inviolable principle:** zero forms before the call. Phone + language is the entire entry point.

### 2.2 Employer flow

**Four intake options** (employer picks one):
1. Voice — phones the AI, walks through structured questions
2. Upload JD (PDF/doc) — AI parses then asks clarifying questions
3. Paste link — to existing job post
4. Connect ATS — pulls existing reqs; we layer on top

**Voice intake — 9 question categories** (sidebar progress, "Question N of 9"): Caller & company → The role → Volume & timeline → Location & pattern → Budget → Must-haves → Deal-breakers → Process → Contact.

**JD upload variant:** AI parses file, then asks 2–3 inline clarifying follow-ups with one-tap response chips ("Add requirement", "Lead extra +£20/day", "Tools provided") — not a full re-interview.

**Job-post review:** SAME two-pane pattern as candidate profile — editable conversation on left, live-rendered job post on right. Sections: PROJECT SCOPE / WHAT YOU'LL NEED / RATE & TIMING. "Save as job template" checkbox. CTAs: Call again / Re-upload JD / See workers.

**Auth:** Google / **Microsoft** / work email (magic link). Note: differs from candidate (no LinkedIn). Calendar OAuth checkbox for AI-interview scheduling.

**Jobs dashboard:** tabs (All / Active / Interviewing / Paused / Filled with counts) + stats row (Total matches, Awaiting interview, Avg match score, AI screenings this week) + table (Job · Location · Pay · Workers · Top-N% · Status).

**Per-job page:** Top 3 match cards with **"Why ranked #N"** explanations (not just scores). Schedule interview modal = `AI screening (~10 min, 24/7)` OR `With me` + time-slot grid. Right rail: **Hiring Copilot** (NL/voice refinement of shortlist with role-aware chips) + This-job stats panel + ATS pull.

**ATS partners (day 1):** Greenhouse · Workable · Ashby · BambooHR. Read-only · OAuth · SOC 2 · GDPR.

**Inviolable principle:** "We're not where you post a job. We're where you describe what you need and we find the people."

## 3. Technical architecture

### 3.1 Foundation: fork from `cozmo-voice-agent`

Local: `/Users/godfirstamen/Documents/cozmo-interview-questions/`
GitHub: https://github.com/faalbane/cozmo-voice-agent

Proven: 100 concurrent PSTN calls @ <600ms round-trip latency.

**Stack as-is:**
- Pipecat pipeline (Python): Silero VAD → Deepgram STT → Groq Llama 3.1 8B → Deepgram Aura TTS
- Twilio SIP trunk → Daily.co WebRTC → Pipecat
- FastAPI server, SQLite, Redis call state
- Firebase Functions + Hosting wired
- Prometheus + Grafana, Docker compose
- Resilience: circuit breakers, health checks, retries

### 3.2 Swaps for Gig-grab

| Concern | Cozmo today | Gig-grab change | Why |
|---|---|---|---|
| STT | Deepgram Nova-2 | **Deepgram Nova-3 `multi`** | Code-switching across 10 languages including EN/ES/FR/DE/HI/PT/IT/JA/RU/NL |
| TTS | Deepgram Aura (English) | **Cartesia Sonic-3** (42 langs) or **ElevenLabs v3** (74 langs) | Match the multilingual landing promise; richer voices |
| LLM (turn-by-turn) | Groq Llama 3.1 8B | **Keep** for in-call latency | ~100ms TTFT is the unfair advantage |
| LLM (reasoning) | n/a | **Anthropic Claude Sonnet 4.6** | Question generation, profile synthesis, candidate↔job matching reasoning |
| State | SQLite | **Firestore** | Firebase + gcloud already authed; serverless |
| Search | Keyword | **Vector search (Firestore vector index)** | Match candidate transcripts ↔ job descriptions semantically |
| Verify | n/a | **Twilio Verify** | OTP at landing, then auto-dial via Pipecat |
| Notifications | n/a | **Twilio (SMS) + WhatsApp Business + SendGrid** | Step 8 alerts |

### 3.3 Data model (first cut, Firestore)

```
candidates/{id}
  phone, language, profile_card, transcript[], cv_url, linkedin_id,
  match_signals{trade, years, certs, locations, deal_breakers, pay_floor, ...},
  created_at, last_call_at

employers/{id}
  email, company, calendar_id, ats_connection?, jobs[]

jobs/{id}
  employer_id, title, location, pay, shift_pattern, must_haves, deal_breakers,
  source: 'voice'|'upload'|'link'|'ats',
  status: 'active'|'interviewing'|'paused'|'filled',
  embedding[],
  required_count

matches/{id}
  candidate_id, job_id, score, status: 'suggested'|'applied'|'screened'|'shortlisted'|'rejected',
  interview_id?

interviews/{id}
  candidate_id, job_id, type: 'ai'|'human', slot, calendar_event_id, transcript?
```

### 3.4 Component map

```
                    ┌─ Twilio PSTN ──────┐         ┌─ Web client ──────┐
                    │ inbound/outbound   │         │ candidate landing │
                    │ + Verify OTP       │         │ + employer dash   │
                    └────────┬───────────┘         └─────────┬─────────┘
                             │                               │
                             ▼                               ▼
                    ┌────────────────────────────────────────────────┐
                    │              Pipecat agents                     │
                    │  candidate-interview-bot   employer-intake-bot  │
                    │   (8 categories, ~2 min)    (9 categories, ~5m) │
                    │  Nova-3 multi → Llama 8B → Sonic-3              │
                    │                                                 │
                    │  +  AI-screening sub-bot (~10 min)              │
                    │  +  Hiring Copilot (per-job NL/voice agent —    │
                    │      Claude Sonnet 4.6 + tool use)              │
                    └────────────────┬───────────────────────────────┘
                                     │ (transcripts, signals)
                                     ▼
                    ┌────────────────────────────────────────────────┐
                    │         Matching & orchestration                │
                    │   Claude Sonnet 4.6 — profile synthesis,        │
                    │   structured extraction, match reasoning        │
                    │   Vector search over jobs ↔ candidates          │
                    └────────────────┬───────────────────────────────┘
                                     │
                ┌────────────────────┼─────────────────────┐
                ▼                    ▼                     ▼
         ┌──────────────┐   ┌──────────────┐     ┌──────────────────┐
         │ Auto-apply   │   │ Alerts       │     │ Interview        │
         │ bot (rules)  │   │ Twilio/SG    │     │ scheduler        │
         └──────────────┘   └──────────────┘     └──────────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────────────────────┐
                    │  Firestore (candidates, jobs, matches, ...)     │
                    │  Firebase Functions (webhooks, cron)            │
                    │  Firebase Hosting (Next.js or static)           │
                    └────────────────────────────────────────────────┘
```

## 4. GTM & pilot targets

Hafiz starts outbound campaigns immediately. Goal: **1–2 pilot customers** fast.

**Verticals, ranked:**
1. Hospitality / QSR — McDonald's, Chipotle. Fastest close, clear ROI.
2. Healthcare / Care — care homes, agencies. Higher willingness to pay, strong retention.
3. Construction & hard labour — agency-led, less digitised.
4. Cleaning & facilities — fragmented, high churn.
5. Retail, Childcare, Admin, Personal services — later.

Open ask of Ali: share details on currently running customers/campaigns we can compound on.

## 5. Phased implementation plan

### Phase 0 — Foundation (this week)
- [ ] `gh repo create` for `gig-grab` (public or private)
- [ ] `firebase init` in working dir; create new GCP/Firebase project
- [ ] Provision Twilio number + SIP trunk (reuse cozmo's `infra/twilio-setup.sh`)
- [ ] Stand up secrets in `.env` and Firebase Functions config
- [ ] Fork relevant cozmo modules: `src/agent.py`, `src/main.py`, `src/resilience/`, `infra/sip-trunk-config.json`

### Phase 1 — Candidate MVP (week 1–2)
- [ ] Landing page (`I'm looking for work` + phone + language picker)
- [ ] Twilio Verify OTP → trigger outbound Pipecat call
- [ ] Candidate-interview bot — 8 question categories (Language & name, Your trade, Certs & tickets, Recent work, Location & travel, Availability, Pay expectation, Deal-breakers), Nova-3 multi, Sonic-3 voice
- [ ] Post-call: profile card screen (jackandjill.ai-style), edit + confirm
- [ ] Email/auth capture
- [ ] Firestore schema for candidates

### Phase 2 — Employer MVP (week 2–3)
- [ ] Employer landing + 4 intake options (voice / upload / link / ATS)
- [ ] Employer-intake bot — 9 question categories
- [ ] JD upload parser (Claude Sonnet 4.6 over PDF/text) + clarifying-follow-ups UI
- [ ] Two-pane "Project conversation + live job post" review screen
- [ ] Job creation + jobs dashboard with status tabs
- [ ] Vector index of jobs; match candidates → jobs with **why-ranked explanation per match**

### Phase 3 — Match / Apply / Schedule (week 3–4)
- [ ] Auto-apply rules engine
- [ ] Alert pipeline (SMS/WhatsApp/email)
- [ ] Interview scheduler (calendar OAuth + AI-screening or human option)
- [ ] AI-screening sub-bot for short structured 10-min screens
- [ ] **Hiring Copilot** — per-job NL/voice refinement agent with role-aware suggestion chips and tool use (filter, schedule, message, generate brief)
- [ ] ATS day-1 integrations: Greenhouse, Workable, Ashby, BambooHR (read-only OAuth)

### Phase 4 — Pilot launch (week 4+)
- [ ] Onboard Hospitality/QSR pilot
- [ ] Job-source scraper (target ~100 initially)
- [ ] Observability dashboard (reuse cozmo's Prometheus + Grafana)

## 6. Open questions / decisions to make

1. **Repo strategy:** new repo or fork cozmo-voice-agent? *Recommendation:* new repo, copy in cozmo modules. The two products will diverge fast.
2. **Web framework:** Next.js on Firebase Hosting (default) vs SvelteKit vs Remix?
3. **Auto-apply mechanics:** how do we actually submit applications to external systems? Job-board APIs, headless browser fleet, or only ATS-integrated employers in Phase 1?
4. **Voice TTS:** Cartesia Sonic-3 vs ElevenLabs v3 — A/B in week 1? Cartesia is lower latency; ElevenLabs has more languages.
5. **Interview question set:** Frank wants suggestions — see candidate flow step 3 for current draft.
6. **Pricing:** not specified yet. Per-hire? Per-screen? Subscription per req?

## 7. Glossary / source of truth

- **Memory (intelligence system):** `.claude/projects/-Users-godfirstamen-Documents-gig-grab/memory/` — durable across sessions; canonical context for AI assistants.
- **Spec (this file):** human-readable summary kept in sync with memory.
- **Reference voice-agent stack:** `/Users/godfirstamen/Documents/cozmo-interview-questions/` (github.com/faalbane/cozmo-voice-agent).
- **Figma:** *Redesign-Employee-UX-Narrative* (URL with Frank).
- **Inspo:** jackandjill.ai (post-call profile aesthetic).
