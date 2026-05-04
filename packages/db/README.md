# @gig-grab/db

Postgres + Drizzle ORM data layer.

## Setup

**Production:** Google Cloud SQL for PostgreSQL 16 with `pgvector`.

```bash
# 1. Enable APIs and provision (run once — see infra/cloudsql-setup.sh)
bash infra/cloudsql-setup.sh

# 2. Connect via Cloud SQL Auth Proxy on :5433
gcloud sql connect gig-grab-db --user=gig_app --database=gig_grab

# 3. Set DATABASE_URL in .env (see .env.example for format) and push schema
pnpm --filter @gig-grab/db push
```

**Local dev:** no Cloud SQL needed.

```bash
docker compose -f infra/docker-compose.dev.yml up -d
# DATABASE_URL=postgres://gig:gig@localhost:5432/gig_grab
pnpm --filter @gig-grab/db push
```

## Local development

Run Postgres + Redis via Docker:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
# Postgres on :5432, Redis on :6379
```

Then `DATABASE_URL=postgres://gig:gig@localhost:5432/gig_grab` in `.env`.

## Scripts

| Command | What |
|---|---|
| `pnpm --filter @gig-grab/db generate` | Generate SQL migration from schema diffs |
| `pnpm --filter @gig-grab/db migrate` | Apply pending migrations |
| `pnpm --filter @gig-grab/db push` | Sync schema directly (Phase 0/1, no real data yet) |
| `pnpm --filter @gig-grab/db studio` | Drizzle Studio — browse data in the browser |

## Schema overview

See `src/schema.ts`. Key tables:

- `candidates` (PK = Firebase Auth UID, has `profile_embedding vector(1536)`)
- `profile_cards` (1:1 with candidate — what renders in the CV preview)
- `sessions` + `transcript_turns` — every voice interaction
- `employers`, `ats_connections`
- `jobs` (has `embedding vector(1536)`)
- `matches` (unique per candidate × job, with score and why-ranked text)
- `interviews`
- `auto_apply_rules`, `alerts`

Vector indexes use HNSW with `vector_cosine_ops` (best for normalized embeddings).
