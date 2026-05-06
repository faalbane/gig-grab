# CLAUDE.md — Gig-grab AI assistant context

This file is auto-loaded by Claude Code at the start of every session in this repo. Keep it short — the heavy detail lives in `CLOUD.md` and `SPEC.md`.

---

## Project in one paragraph

Gig-grab is a voice-first AI hiring agent. Candidates speak; the AI extracts intent, structures it, matches them to live roles, auto-applies, and arranges interviews. Employers describe roles by voice / JD / link / ATS. Stack: Next.js (Firebase Hosting), Cloud Functions v2 `api` on Cloud Run (europe-west2), Pipecat voice agent on **Render** (`gigrab-agent.onrender.com`), Postgres 16 + pgvector on Cloud SQL. Twilio for telephony. Anthropic Claude Sonnet 4.6 for reasoning, Deepgram + Groq + Cartesia for voice. Phase: pilot-ready sprint, ~10 working days from 2026-05-06.

## Where to read more

- `SPEC.md` — product + engineering spec (data model, candidate/employer flows, phased plan)
- `CLOUD.md` — deployment + ops reference (resources, deploy commands, secrets, current state)
- `docs/twilio-support.md` — Twilio support-ticket playbook
- `docs/dev-onboarding.md` — fast-path setup for new engineers
- Memory at `.claude/projects/-Users-faalbane-Documents-gig-grab/memory/` — durable AI-assistant state (feedback, project facts, references)

## Operating mode (durable, set by Frank 2026-05-06)

- **Autonomous execution authorized.** When Frank asks for a push, deploy, or production change, run it without re-asking. Includes `git push origin main`, `firebase deploy`, `gcloud run …`, `render …`. CLI tools we're already logged into are fair game.
- **Test in production.** No staging environment. Every push goes to prod; iterate fast, watch logs, fix forward.
- **Surgical execution.** One attempt → verify → pivot. Don't chain speculative 5+ minute builds. Always state production-state changes before running them, but don't pause for re-confirmation on already-agreed plans.
- **Pilot-ready scope.** Initial production version = one real candidate can call → talk → see profile → see matches; one employer can do voice/JD intake → see ranked candidates. Phase 3 (auto-apply, Hiring Copilot, ATS connectors, AI screening) is **post-pilot**, do not build now. See `project_pilot_plan.md` in memory.

## Core conventions / DO-NOT list

1. **Postgres + Drizzle + pgvector** — never reintroduce Firestore. Schema in `packages/db/src/schema.ts`.
2. **No `workspace:*` deps** in any `package.json` Cloud Build will install. esbuild aliases handle monorepo imports for `functions/` and the agent.
3. **`functions/lib/` and `packages/db/migrations/meta/`** are gitignored — don't commit them.
4. **Twilio webhook signature verification stays strict** in `functions/src/twilio-webhook.ts`. No per-trigger exemptions.
5. **Read pasted documents in full** — never skim or sample. Same for diffs / PRs.
6. **No emoji in code or commit messages** unless Frank explicitly asks.
7. **Don't share secrets via shell history or chat** — copy from `.env` locally; for `gcloud secrets`, use `mode 600` temp files.

## Active blockers / decisions

- **GCP Cloud Run frontend bug** on this project: `gcloud run deploy` services 404 from their `.run.app` URL. Workaround: agent lives on Render (Frankfurt). Track GCP support ticket.
- **Cloud SQL connectivity from Render** uses public IP `34.105.197.42` with `requireSsl=true` and `authorizedNetworks=0.0.0.0/0`. Acceptable short-term; tighten to Cloud SQL Auth Proxy sidecar before scale-ready.

## Identity mapping

- User: Frank Albanese — `frank@taverncommunity.com`
- GCP / Firebase: `faalbane@gmail.com` (project `gig-grab`, project number `353215144615`)
- GitHub: `faalbane` (repo `faalbane/gig-grab`, private, default branch `main`)
- Twilio: account "Overton" (SID `ACda818e202ba9491a54b493f8d5bc77c8`)
- Render: workspace `giggrab` (`tea-d7tlusi8qa3s73c9c2sg`); agent service `srv-d7tm084m0tmc73ctijpg`
