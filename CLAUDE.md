# CLAUDE.md — Gig-grab AI assistant context

This file is auto-loaded by Claude Code at the start of every session in this repo. **Canonical context.** CLOUD.md remains the deeper ops reference; key state from CLOUD.md is mirrored here so a fresh session is never out-of-date.

---

## Project in one paragraph

Gig-grab is a voice-first AI hiring agent. Candidates speak; the AI extracts intent, structures it, matches them to live roles, lets them apply, and arranges interviews. Employers describe roles by voice / JD / link / ATS. Stack: Next.js on Firebase Hosting (`giggrab.io`), Cloud Functions v2 `api` on Cloud Run (europe-west2), Pipecat voice agent on **Render** (`gig-grab.onrender.com`), Postgres 16 + pgvector on Cloud SQL. Twilio for telephony. Anthropic Claude Sonnet 4.6 for reasoning + Sonnet snapshot extracts. Deepgram + Groq Llama 3.1 8B + Cartesia Sonic-2 for voice. Phase: pilot-ready sprint from 2026-05-06.

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
- **Pilot-ready scope.** Initial production version = one real candidate can call → talk → see profile → see matches → apply; one employer can do voice/JD intake → see ranked candidates. Phase 3 (auto-apply rules, Hiring Copilot, ATS connectors, AI screening) is **post-pilot**, do not build now. See `project_pilot_plan.md` in memory.

## Core conventions / DO-NOT list

1. **Postgres + Drizzle + pgvector** — never reintroduce Firestore. Schema in `packages/db/src/schema.ts`.
2. **No `workspace:*` deps** in any `package.json` Cloud Build will install. esbuild aliases handle monorepo imports for `functions/` and the agent.
3. **`functions/lib/` and `packages/db/migrations/meta/`** are gitignored — don't commit them.
4. **Twilio webhook signature verification stays strict** in `functions/src/twilio-webhook.ts`. No per-trigger exemptions. Verifier accepts multiple web bases during domain transitions; see `functions/src/security.ts`.
5. **Read pasted documents in full** — never skim or sample. Same for diffs / PRs.
6. **No emoji in code or commit messages** unless Frank explicitly asks.
7. **Don't share secrets via shell history or chat** — copy from `.env` locally; for `gcloud secrets`, use `mode 600` temp files.
8. **No new MD documents** unless Frank asks. Keep working state in CLAUDE.md + memory.

## Current production state (2026-05-12)

- **Production web origin:** `https://giggrab.io` (cutover from `gitgrab.io`, which was refunded). `gig-grab.web.app` still serves in parallel as legacy fallback. `gig-grab.firebaseapp.com` remains the Firebase Auth handler host (unchanged).
- **Twilio signature verifier** validates against `giggrab.io` + `gitgrab.io` + `gig-grab.web.app` during the cut. Drop legacy entries ~1 week after Twilio Console URL flip is clean.
- **Twilio number config** is being flipped Voice + StatusCallback URLs from `gitgrab.io` → `giggrab.io` as the last step of the cutover. Route accepts both `/api/twilio/status` and `/api/twilio/inbound-status`.
- **Identity linking on Google sign-in:** Google sign-in creates a stub candidates row keyed by email. To merge a prior hotline call, the user must verify their phone via `/settings` — `accountPhoneConfirm` does the MERGE. Phone-OTP sign-in does the merge automatically via `auth/link` path 2.
- **`accountMe` / `accountProfileUpdate` / `accountPhoneConfirm` / `accountWebCallStart`** self-heal a missing candidate row by resolving uid → phone → verified-email → stub fallback. No more "no candidate row" errors on first dashboard load.
- **Post-call SMS link is removed.** Outro tells callers to "log on to giggrab.io with your phone number". Phone-OTP merge replaces the SMS-token deep link.
- **Live CV during `/voice` calls:** `POST /api/sessions/:id/extract-snapshot` (Firebase-auth + session-owner gated) re-runs `extractProfile` mid-call. VoiceCallView fires it every 6 transcript turns with 8 s cooldown.
- **Job apply (web + phone) wired:** `POST /api/account/jobs/:jobId/apply` upserts a row into `matches` with `status='applied'`. Phone-side: `extractProfile` returns `applyIntents[]` per call; backend fuzzy-matches against active jobs and writes the same `matches` row. JobCard renders an Applied pill when the row exists.
- **Adzuna ingest** populates `jobs` from UK + US trades queries. Cloud Scheduler cron `jobsIngestAdzunaRefreshAll` runs every 12 h.

## Active blockers / decisions

- **GCP Cloud Run frontend bug** on this project: `gcloud run deploy` services 404 from their `.run.app` URL. Workaround: agent lives on Render (Frankfurt). Track GCP support ticket.
- **Cloud SQL connectivity from Render** uses public IP `34.105.197.42` with `requireSsl=true` and `authorizedNetworks=0.0.0.0/0`. Acceptable short-term; tighten to Cloud SQL Auth Proxy sidecar before scale-ready.

## Identity mapping

- User: Frank Albanese — `frank@taverncommunity.com`
- GCP / Firebase: `faalbane@gmail.com` (project `gig-grab`, project number `353215144615`)
- GitHub: `faalbane` (repo `faalbane/gig-grab`, private, default branch `main`)
- Twilio: account "Overton" (SID `ACda818e202ba9491a54b493f8d5bc77c8`)
- Render: workspace `giggrab` (`tea-d7tlusi8qa3s73c9c2sg`); agent service `srv-d7tm084m0tmc73ctijpg`
