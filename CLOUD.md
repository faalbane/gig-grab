# CLOUD.md — Gig-grab production deployment reference

Self-contained guide. Pick this up on any machine with `gcloud`, `firebase`, and `gh` logged in (as `faalbane@gmail.com` for gcloud + Firebase; `faalbane` for GitHub).

---

## TL;DR — what's running, where

| What | Where | URL |
|---|---|---|
| Web app | Firebase Hosting | https://gig-grab.web.app |
| API (Cloud Functions v2) | Cloud Run · `api` · europe-west2 | https://gig-grab.web.app/api/* (proxy) · https://api-353215144615.europe-west2.run.app (direct, works) |
| Voice agent (Pipecat) | **Render · `gigrab-agent` · Frankfurt** | https://gig-grab.onrender.com/healthz · WS at wss://gig-grab.onrender.com/ws |
| Database | Cloud SQL Postgres 16 | `gig-grab:europe-west2:gig-grab-db` (Auth Proxy on :5433) |
| Object storage | Firebase Storage | `gig-grab.firebasestorage.app` |
| Auth | Firebase Auth | Google + Microsoft + email magic link |
| Secrets | Google Secret Manager | (10 secrets — see "Secrets" below) |
| Telephony | Twilio | account SID `ACda818e202ba9491a54b493f8d5bc77c8` (friendly name "Overton") |
| Source | GitHub | https://github.com/faalbane/gig-grab (private) |

---

## ⚠ Decision history — agent on Render (executed 2026-05-06)

GCP has a project-level Cloud Run frontend bug in this account: any service deployed via `gcloud run deploy` returns Google's edge 404 from its public `.run.app` URL (verified with a stock hello-world). Firebase-deployed Cloud Run services (the `api` function) work fine because they register through Firebase's deploy path. Only `gigrab-agent` was affected.

**Resolution:** moved the agent to **Render** (Frankfurt, Starter $7/mo, Hobby workspace). Same Dockerfile, no code changes to the pipeline. GitHub auto-deploy on push to `main`. Service: https://gig-grab.onrender.com (`srv-d7tm084m0tmc73ctijpg`, workspace `tea-d7tlusi8qa3s73c9c2sg`).

A separate GCP support ticket can still be filed in parallel; if/when GCP fixes the routing, we may move the agent back. Render is treated as a bridge, not a destination.

### Twilio Media Streams gotcha

Twilio **strips query strings from the WebSocket connect URL**. When the api builds `wss://gig-grab.onrender.com/ws?sessionId=…&language=…`, Twilio dials bare `/ws` and delivers the params inside the first JSON `start` frame's `customParameters` field. The agent (`apps/agent/src/gigrab/main.py`) consumes the `connected` + `start` frames first, extracts `customParameters.sessionId`, `language`, `audience`, plus `start.streamSid`, then runs the Pipecat pipeline. **Don't** revert this to `parse_qs(websocket.url)` — it returns empty.

---

## Resource inventory

### GCP project

- **Project ID:** `gig-grab`
- **Project number:** `353215144615`
- **Active gcloud account:** `faalbane@gmail.com`
- **Billing account:** `01D6EF-D14B4B-8972BD` (dedicated to Gig-grab — created because the existing two Firebase Payment accounts hit the default 5-project quota)
- **Console:** https://console.firebase.google.com/project/gig-grab/overview
- **Default region:** `europe-west2` (London — closest to UK pilot)
- **Compute service account:** `353215144615-compute@developer.gserviceaccount.com` (has `roles/cloudsql.client` + `roles/secretmanager.secretAccessor` on every secret)

### Cloud Run services (region `europe-west2`)

| Service | Purpose | Source | Special config |
|---|---|---|---|
| `api` | Cloud Functions v2 (Node 20). Multi-route: `/health`, `POST /intake/start`, `GET\|POST /twilio/voice/:id`, `POST /twilio/status/:id`, `GET /sessions/:id/profile`, `POST /auth/link` | `functions/` (esbuild bundle to `lib/index.js`) | Cloud SQL mount + 6 secret bindings + `AGENT_WS_URL=wss://gig-grab.onrender.com/ws` + `PUBLIC_API_URL` env. Firebase CLI 15.x preserves Cloud Run env / mounts / IAM across deploys (the older "always re-run gcloud update" advice no longer applies). Verify with the read-only commands below if uncertain. |
| `gigrab-agent` | **Now on Render** — see "Decision history" above. Repo path `apps/agent/` deploys via Render's GitHub auto-deploy on push to `main`. Pipecat voice agent (Python 3.12). Twilio Media Streams WebSocket on `/ws`. | `apps/agent/` (Dockerfile build) | Render Starter, Frankfurt. 5 env vars (DATABASE_URL TCP-form + 4 AI keys) set in Render dashboard. |

### Cloud SQL Postgres 16

- **Instance:** `gig-grab-db`
- **Region:** `europe-west2`
- **Tier:** `db-custom-1-3840` (1 vCPU, 3.75GB RAM, ENTERPRISE edition — *not* Plus, because Plus only allows pre-defined `db-perf-optimized-N-*` tiers)
- **DB:** `gig_grab`
- **User:** `gig_app` (password in Secret Manager as `DATABASE_URL`)
- **Extensions:** `vector` 0.8.1, `pg_trgm` 1.6
- **Storage:** SSD 10GB auto-increase, daily backups @ 03:00, point-in-time recovery on
- **Public IP:** `34.105.197.42` — `requireSsl=true`, `authorizedNetworks=0.0.0.0/0` (set 2026-05-06 so Render can connect over TCP+SSL). Tighten to a Cloud SQL Auth Proxy sidecar before scale-ready; document in `feedback_db_connectivity` memory.
- **Connection name (for Auth Proxy + unix socket):** `gig-grab:europe-west2:gig-grab-db`
- **Schema:** 11 tables — `candidates`, `profile_cards`, `sessions`, `transcript_turns`, `employers`, `ats_connections`, `jobs`, `matches`, `interviews`, `auto_apply_rules`, `alerts`. See `packages/db/src/schema.ts` and `packages/db/migrations/`.

### Firebase

- **Project:** `gig-grab` (same as GCP)
- **Hosting site:** `gig-grab.web.app` + `gig-grab.firebaseapp.com`
- **Web App ID:** `1:353215144615:web:21dae6d708cb55c31db182`
- **Storage bucket:** `gig-grab.firebasestorage.app`
- **Auth providers wired in code:** Google (popup), Microsoft (popup), email magic link via `signInWithEmailLink`. **Need to be enabled in Firebase Console manually** before `/auth` works for new users.
- **Firestore:** **NOT IN USE** — we removed it; the data layer is Postgres on Cloud SQL.

### Secret Manager (project `gig-grab`)

10 secrets, all granted `secretAccessor` to the compute SA:

| Secret | Used by | Rotates? |
|---|---|---|
| `DATABASE_URL` | api, gigrab-agent | Generated at Cloud SQL setup |
| `SESSION_SECRET` | api | Static random; rotate breaks active session tokens |
| `ANTHROPIC_API_KEY` | api, gigrab-agent | From console.anthropic.com |
| `TWILIO_ACCOUNT_SID` | api | Account SID (not really secret but kept here for hygiene) |
| `TWILIO_AUTH_TOKEN` | api | From Twilio Console |
| `TWILIO_PHONE_NUMBER` | api | Currently `+15515534910` (US testing). Will swap for UK before pilot. |
| `TWILIO_VERIFY_SERVICE_SID` | (reserved) | `VAd978ff64d775df521a267f1b46f4ad2d` |
| `DEEPGRAM_API_KEY` | gigrab-agent | From console.deepgram.com |
| `GROQ_API_KEY` | gigrab-agent | From console.groq.com |
| `CARTESIA_API_KEY` | gigrab-agent | From play.cartesia.ai |

### Twilio

- **Friendly name:** "Overton" (yes, the account is named Overton; the *app* is Gig-grab)
- **SID:** `ACda818e202ba9491a54b493f8d5bc77c8`
- **Type:** Full · Active · ~£33 GBP balance
- **Phone numbers (active):**
  - `+1 551 553 4910` — primary US (testing)
  - `+1 561 559 6512` — secondary US
- **Verify Service SID:** `VAd978ff64d775df521a267f1b46f4ad2d`
- **API Key SID** (for server-to-server, preferred over auth token): `SK8b7ffc5595b6bc813ff9b0328c78bdcd`
- **Trust state:** Account-level "verified caller IDs only" restriction was lifted by Twilio support on 2026-05-06. Outbound to any consenting US number works.
- **Trust Hub Customer Profile:** to be completed before high-volume launch — see `docs/twilio-support.md`.

### GitHub

- **Repo:** https://github.com/faalbane/gig-grab (private)
- **Active gh account:** `faalbane`
- **Default branch:** `main`
- **CI:** none yet

---

## Knowledge tree — dependency map

```
Browser (https://gig-grab.web.app)
  │
  ├── /                        Next.js static page  ← built from apps/web/, deployed to Firebase Hosting
  ├── /hiring, /start, /calling, /profile, /auth, /dashboard…
  │
  ├── /api/**                  Firebase Hosting REWRITE → Cloud Run service `api` (europe-west2)
  │                              ├── reads secrets: DATABASE_URL, TWILIO_*, ANTHROPIC_API_KEY, SESSION_SECRET
  │                              ├── writes/reads: Cloud SQL Postgres (via unix socket /cloudsql/…)
  │                              ├── calls out to: Twilio REST (calls.create, validation), Anthropic API
  │                              └── verifies: Firebase Auth ID tokens (firebase-admin)
  │
  └── (no /agent/* rewrite anymore — Twilio dials Render directly via api's TwiML)

Render (https://gig-grab.onrender.com)
  └── gigrab-agent (Pipecat) — Twilio Media Streams WebSocket at wss://gig-grab.onrender.com/ws
       ├── reads env (Render dashboard): DATABASE_URL (TCP+SSL), DEEPGRAM_API_KEY, GROQ_API_KEY, CARTESIA_API_KEY, ANTHROPIC_API_KEY
       ├── pipeline: Silero VAD → Deepgram Nova-3 multi STT → Groq Llama 3.1 8B LLM → Cartesia Sonic-2 TTS
       ├── consumes Twilio start frame to get sessionId / streamSid / language (NOT from URL — Twilio strips query)
       ├── writes: Cloud SQL transcript_turns (asyncpg over public IP + sslmode=require)
       └── system prompts:
             apps/agent/src/prompts/candidate_interview.py  (8 categories)
             apps/agent/src/prompts/employer_intake.py      (9 categories)
  │
  └── ** (anything else)       Firebase Hosting falls through to /index.html (Next.js static export)

Twilio (outbound on candidate's phone)
  │ user picks up
  ├── GET /api/twilio/voice/:sessionId
  │     → returns TwiML <Connect><Stream url="wss://gig-grab.onrender.com/ws?sessionId=…&language=…"/></Connect>
  │     → Twilio strips the query string, dials wss://gig-grab.onrender.com/ws bare
  │     → params arrive in the start frame's customParameters (see "Twilio Media Streams gotcha")
  │
  └── POST /api/twilio/status/:sessionId  (during + after call)
        → verifies X-Twilio-Signature
        → updates sessions.status in Postgres
        → on completed: routes to extractProfile (candidate) or extractEmployerJob (employer)
            → calls Anthropic Claude Sonnet 4.6 → writes profile_cards or employers+jobs

Cloud SQL Postgres (gig-grab:europe-west2:gig-grab-db)
  ├── 11 tables (see packages/db/src/schema.ts)
  ├── pgvector HNSW indexes on candidates.profile_embedding + jobs.embedding (1536d)
  └── Reached via:
        - Cloud Functions / Cloud Run: unix socket /cloudsql/PROJECT:REGION:INSTANCE (mounted via --add-cloudsql-instances)
        - Local dev: Cloud SQL Auth Proxy on :5433
```

---

## Deployment process

### Repo locations

| Path | What deploys it |
|---|---|
| `apps/web/` | `firebase deploy --only hosting` |
| `apps/agent/` | `git push origin main` — Render auto-deploys from GitHub |
| `functions/` | `firebase deploy --only functions` |
| `packages/db/` | not a deploy target (schema applied via `pnpm db:push` or migrations) |
| `packages/shared/` | not a deploy target (consumed by web at build time) |
| `infra/` | shell scripts + docker-compose; not deployed |
| `firebase.json`, `firestore.rules`, `storage.rules` | included in `firebase deploy` |

### One-time setup on a fresh machine

```bash
# Auth (each tool)
gcloud auth login                # then `gcloud config set project gig-grab`
gcloud auth application-default login
firebase login
gh auth login

# Pick the right gcloud account/project if you have multiple
gcloud config set account faalbane@gmail.com
gcloud config set project gig-grab
firebase use gig-grab

# Clone
git clone https://github.com/faalbane/gig-grab.git
cd gig-grab

# Install
pnpm install                     # web + functions + packages
cd apps/agent && python3.12 -m venv .venv && source .venv/bin/activate && pip install -e . && cd ../..

# Get .env (gitignored — copy from another machine, or rebuild from Secret Manager)
# .env contains: DATABASE_URL (proxy form), all TWILIO_*, all AI keys, NEXT_PUBLIC_FIREBASE_*

# Cloud SQL Auth Proxy (so local DB scripts work)
curl -fL "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.2/cloud-sql-proxy.darwin.arm64" \
  -o /tmp/cloud-sql-proxy && chmod +x /tmp/cloud-sql-proxy
/tmp/cloud-sql-proxy gig-grab:europe-west2:gig-grab-db --port 5433 &
```

### Web deploy (~30s)

```bash
pnpm --filter @gig-grab/web build
firebase deploy --only hosting --project gig-grab
```

### Functions deploy (~2 min)

```bash
firebase deploy --only functions --project gig-grab --force
```

> Firebase CLI 15.x preserves Cloud Run env vars, Cloud SQL mount, and IAM bindings across deploys (verified 2026-05-06 — `AGENT_WS_URL`, `PUBLIC_API_URL`, the `/cloudsql/…` mount, and `allUsers` invoker IAM all stayed intact after a `firebase deploy --only functions`). The older "always re-run gcloud update afterward" instruction is no longer needed.
>
> If you ever suspect a reset, verify with these read-only commands:
>
> ```bash
> gcloud run services describe api --region=europe-west2 --project=gig-grab \
>   --format="value(spec.template.spec.containers[0].env)" | tr ',' '\n' | grep -E "AGENT_WS_URL|PUBLIC_API_URL"
> gcloud run services describe api --region=europe-west2 --project=gig-grab \
>   --format="value(spec.template.metadata.annotations.'run.googleapis.com/cloudsql-instances')"
> gcloud run services get-iam-policy api --region=europe-west2 --project=gig-grab \
>   --format="value(bindings)" | grep -E "allUsers|invoker"
> ```

### Agent deploy (~5–8 min — Render auto-build)

```bash
git push origin main                    # Render auto-deploys on push to main
render deploys list srv-d7tm084m0tmc73ctijpg --output text --confirm
render logs --resources srv-d7tm084m0tmc73ctijpg --tail
```

Manual redeploy (no code change, e.g. env-var update):

```
Dashboard → gigrab-agent → Manual Deploy → Deploy latest commit
```

> ⚠ Don't queue back-to-back agent deploys hoping a different config fixes a runtime issue. See `feedback_surgical_execution` in memory.

### Database migrations

```bash
# Make schema changes in packages/db/src/schema.ts, then:
DATABASE_URL="postgres://gig_app:<pwd>@127.0.0.1:5433/gig_grab" \
  pnpm --filter @gig-grab/db generate

# Review the generated SQL in packages/db/migrations/, then apply:
PGPASSWORD="<pwd>" psql "host=127.0.0.1 port=5433 user=gig_app dbname=gig_grab" \
  -f packages/db/migrations/<latest>.sql
```

### Adding a phone number to Twilio's verified caller IDs (dev/team only)

```bash
set -a && source .env && set +a
pnpm --filter @gig-grab/functions verify-caller "+1XXXXXXXXXX" "Their name"
# Recipient answers the call and types the printed 6-digit code.
```

---

## Common operations

| Want to… | Command |
|---|---|
| Hit production API health | `curl https://gig-grab.web.app/api/health` |
| Hit agent health (Render) | `curl https://gig-grab.onrender.com/healthz` |
| Tail api logs | `gcloud run services logs tail api --region=europe-west2 --project=gig-grab` |
| Tail agent logs | `render logs --resources srv-d7tm084m0tmc73ctijpg --tail` |
| Query agent logs in window | `render logs --resources srv-d7tm084m0tmc73ctijpg --start <ISO> --end <ISO> --output text --confirm` |
| Search api errors last 5 min | `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="api" AND severity>=WARNING' --project=gig-grab --limit=20 --freshness=5m` |
| Browse production DB | `pnpm --filter @gig-grab/db studio` (with proxy running on :5433) |
| List recent Twilio calls | `curl -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json?PageSize=5"` |
| Run unit tests | `pnpm --filter @gig-grab/functions test` |
| Test the live verify form on a team number | `https://gig-grab.web.app/start` and pick that team member's phone (must be in OutgoingCallerIds) |

---

## Documentation index

- `SPEC.md` — product + engineering spec (data model, flows, phased plan)
- `CLOUD.md` — this file (deployment + ops reference)
- `docs/twilio-support.md` — playbook for Twilio support cases (the verified-callers ticket)
- `docs/dev-onboarding.md` — fast-path setup for new team members
- `apps/web/README.md`, `apps/agent/README.md`, `packages/db/README.md` — per-package notes
- `CLAUDE.md` — auto-loaded by Claude Code at session start; lightweight overview + durable rules + pointers
- `.claude/projects/-Users-faalbane-Documents-gig-grab/memory/MEMORY.md` — index of project memory (loaded into AI assistant context every session)

---

## Anti-patterns to avoid

Pulled from the `feedback_*` memory entries — don't repeat these.

1. **Don't chain 5+ minute Cloud Build / Cloud Run deploys speculatively.** One attempt → check → pivot. Pad timeouts to realistic upper bounds, not "just in case" 15-minute waits.
2. **Don't use Firestore.** We deliberately chose Postgres + Drizzle + pgvector. Schema lives in `packages/db/src/schema.ts`. Firestore is gone.
3. **Don't put workspace-protocol deps (`workspace:*`) in any package.json that Cloud Build will install.** Cloud Build's npm chokes on it. Use esbuild aliasing for the agent / functions; the example is in `functions/package.json`'s `build` script.
4. **Don't commit `functions/lib/`** — it's gitignored. Same for `packages/db/migrations/meta/`.
5. **Don't share secrets via shell-history or PR descriptions.** Use a `mode 600` temp file for `gcloud secrets create --data-file=…`.
6. **Don't add per-trigger Twilio webhook signature exemptions** — keep `verifyTwilioSignature` in `functions/src/twilio-webhook.ts` strict. Loose verification is a free path to Claude-extraction abuse.
7. **Don't skim or sample documents pasted by the user** — always view all attachments fully (per `feedback_thoroughness` memory).
