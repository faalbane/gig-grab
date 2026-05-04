# Gig-grab

Voice-first AI hiring agent. Speak it. Match it. Get hired.

> **Not a job board.** Candidates phone in for a 2-minute AI interview; employers describe roles by voice, JD, link, or ATS; we source, match, screen, schedule.

## Where things live

| Path | What |
|---|---|
| [`SPEC.md`](./SPEC.md) | Full product + engineering spec (read this first) |
| [`apps/web/`](./apps/web/) | Next.js 15 web app — landing pages, dashboards |
| [`apps/agent/`](./apps/agent/) | Python + Pipecat voice agent (Twilio SIP, Deepgram, Groq, Cartesia) |
| [`functions/`](./functions/) | Firebase Functions — webhooks, cron, auto-apply, Hiring Copilot |
| [`packages/shared/`](./packages/shared/) | Shared TypeScript types |
| [`infra/`](./infra/) | Twilio SIP config, Prometheus, deploy scripts |
| `.claude/projects/.../memory/` | Persistent project memory for AI assistants |

## Quick start

```bash
# 1. Install (root + workspaces)
pnpm install

# 2. Python agent
cd apps/agent && pip install -e ".[dev]"

# 3. Configure secrets
cp .env.example .env
# fill in DEEPGRAM_API_KEY, GROQ_API_KEY, CARTESIA_API_KEY,
# ANTHROPIC_API_KEY, TWILIO_*, FIREBASE_*

# 4. Run locally
pnpm dev                                # web on :3000
cd apps/agent && python src/main.py     # agent on :8765
firebase emulators:start                # functions + firestore
```

## Stack at a glance

- **Web:** Next.js 15 + TypeScript + Tailwind + shadcn/ui
- **Agent:** Python + Pipecat (Silero VAD → Deepgram Nova-3 multi → Groq Llama 3.1 8B → Cartesia Sonic-3)
- **Reasoning:** Anthropic Claude Sonnet 4.6 (profile synthesis, JD parsing, Hiring Copilot)
- **Telephony:** Twilio Programmable Voice + SIP trunk
- **Backend:** Firebase Functions (TS, Node 20) + Firestore
- **Auth:** Firebase Auth — Google / Microsoft / LinkedIn / email magic link
- **Observability:** Prometheus + Grafana (forked from `cozmo-voice-agent`)

See `SPEC.md` for the complete architecture, data model, and phased build plan.
