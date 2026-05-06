# Dev onboarding

For new team members joining the Gig-grab repo.

## What this repo is

A monorepo. Three deployable surfaces, two language stacks:

| Path | What | Lang | Deploys to |
|---|---|---|---|
| `apps/web/` | Next.js 16 marketing + app | TypeScript | Firebase Hosting (`gig-grab.web.app`) |
| `apps/agent/` | Pipecat voice agent (handles candidate + employer interview calls) | Python 3.12 | Cloud Run (`gigrab-agent`, europe-west2) |
| `functions/` | Cloud Functions API (intake, Twilio webhooks, profile/job extraction, auth) | TypeScript | Firebase Functions → Cloud Run (`api`, europe-west2) |
| `packages/db/` | Drizzle ORM schema + Postgres client | TypeScript | (consumed by `functions` and `agent`) |
| `packages/shared/` | Shared TS types | TypeScript | (consumed by `apps/web`) |
| `infra/` | docker-compose for local dev, Twilio setup script, Cloud SQL setup script | sh / yaml | — |
| `docs/` | This + `twilio-support.md` | md | — |
| `.claude/.../memory/` | Persistent project memory for AI assistants | md | (kept across sessions) |

`SPEC.md` at the repo root is the authoritative product + engineering spec.

## Prereqs

- Node ≥ 20 (Cloud Functions runtime; uvm/asdf/nvm to switch)
- pnpm ≥ 9 (`npm i -g pnpm`)
- Python 3.12 (only if working on the agent — `pyenv install 3.12.x`)
- Docker Desktop (for local Postgres + Redis)
- gcloud, gh, firebase CLIs all logged in (Frank already has these — share access via console)

## Clone + install

```bash
git clone https://github.com/faalbane/gig-grab.git
cd gig-grab
pnpm install
```

For the agent only (Python):

```bash
cd apps/agent
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Local environment

`.env` is gitignored. Get a copy from Frank (or recreate from `.env.example` + Secret Manager).

For local Postgres:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
# Postgres on :5432 with pgvector, Redis on :6379
```

For Cloud SQL access (production data):

```bash
# Download the Cloud SQL Auth Proxy if you don't have it
curl -fL "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.2/cloud-sql-proxy.darwin.arm64" \
  -o /tmp/cloud-sql-proxy && chmod +x /tmp/cloud-sql-proxy

# Run it on :5433 (the .env DATABASE_URL points here)
/tmp/cloud-sql-proxy gig-grab:europe-west2:gig-grab-db --port 5433
```

## What to run

| Want to… | Command |
|---|---|
| Run the web app locally | `pnpm --filter @gig-grab/web dev` (then http://localhost:3000) |
| Run web prod build | `pnpm --filter @gig-grab/web build` |
| Run the Python agent locally | `cd apps/agent && python -m src.gigrab.main` (binds :8080) |
| Run the Functions emulator | `pnpm --filter @gig-grab/functions serve` |
| Push DB schema changes | `pnpm --filter @gig-grab/db push` (after editing `packages/db/src/schema.ts`) |
| Generate a SQL migration | `pnpm --filter @gig-grab/db generate` |
| Browse DB rows | `pnpm --filter @gig-grab/db studio` |
| Type-check everything | `pnpm -r typecheck` |
| Run unit tests | `pnpm --filter @gig-grab/functions test` |
| Verify a team member's phone for Twilio testing | `pnpm --filter @gig-grab/functions verify-caller "+1XXX..." "Their name"` |

## Deploying

**Web only:**
```bash
pnpm --filter @gig-grab/web build
firebase deploy --only hosting --project gig-grab
```

**Functions:**
```bash
firebase deploy --only functions --project gig-grab --force
# IMPORTANT: firebase deploy resets Cloud Run env vars + Cloud SQL mount.
# After every deploy, re-run:
gcloud run services update api \
  --region=europe-west2 --project=gig-grab \
  --add-cloudsql-instances=gig-grab:europe-west2:gig-grab-db \
  --update-env-vars="AGENT_WS_URL=wss://gig-grab.web.app/agent/ws,PUBLIC_API_URL=https://api-353215144615.europe-west2.run.app" \
  --quiet
gcloud run services add-iam-policy-binding api \
  --region=europe-west2 --project=gig-grab \
  --member=allUsers --role=roles/run.invoker --quiet
```

**Agent:**
```bash
cd apps/agent
gcloud run deploy gigrab-agent \
  --source . --region europe-west2 --project gig-grab \
  --allow-unauthenticated --ingress all --execution-environment gen2 \
  --memory 2Gi --cpu 2 --timeout 3600 --port 8080 \
  --add-cloudsql-instances gig-grab:europe-west2:gig-grab-db \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,DEEPGRAM_API_KEY=DEEPGRAM_API_KEY:latest,GROQ_API_KEY=GROQ_API_KEY:latest,CARTESIA_API_KEY=CARTESIA_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest \
  --quiet
```

> ⚠ **Agent direct URL is broken** (Cloud Run frontend bug in this project). Always use `https://gig-grab.web.app/agent/...` via the Firebase Hosting proxy. Configured via the rewrite in `firebase.json`. WebSocket upgrades are preserved through the proxy.

## Where things are configured

| Concern | Location |
|---|---|
| Firebase Hosting routes | `firebase.json` |
| API endpoints | `functions/src/index.ts` (router) + `functions/src/{intake,twilio-webhook,profile,auth,employer-extraction,security}.ts` |
| Candidate-bot system prompt | `apps/agent/src/prompts/candidate_interview.py` |
| Employer-bot system prompt | `apps/agent/src/prompts/employer_intake.py` |
| DB schema | `packages/db/src/schema.ts` |
| DB migrations | `packages/db/migrations/` |
| Web pages | `apps/web/src/app/` |
| Web components | `apps/web/src/components/{marketing,start,profile,auth,dashboard}/` |
| Languages list (drives picker + flag strip + extraction allowlist) | `apps/web/src/lib/languages.ts` + mirrored in `functions/src/security.ts` |
| Brand colour | `bg-emerald-600` / `text-emerald-700` (Tailwind) |

## Where secrets live

Production: **Google Secret Manager** in the `gig-grab` project. The Compute SA (`353215144615-compute@developer.gserviceaccount.com`) has `secretAccessor`.

Secrets:
- `DATABASE_URL` — Postgres unix-socket form
- `SESSION_SECRET` — HMAC for profile-access tokens
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_VERIFY_SERVICE_SID`
- `DEEPGRAM_API_KEY`, `GROQ_API_KEY`, `CARTESIA_API_KEY`, `ANTHROPIC_API_KEY`

Local: `.env` at the repo root (gitignored). Mirror the same names.

## Read first

- `SPEC.md` — full product + engineering spec
- `docs/twilio-support.md` — how to file Twilio support cases (and the gotchas)
- `.claude/projects/-Users-godfirstamen-Documents-gig-grab/memory/MEMORY.md` — index of project memory

## Conventions

- **Branch & PR per task** — main is always deployable
- **Conventional commits not enforced** — but write a good first line
- **Don't commit `functions/lib/`** (gitignored, build output)
- **Don't commit `packages/db/migrations/meta/`** (regenerated)
- **Memory updates in PR descriptions** — when you change architecture, update the matching memory file in the same PR
