# @gig-grab/db

Postgres + Drizzle ORM data layer.

## Setup

1. **Sign up at [neon.tech](https://neon.tech)** (or use any Postgres 16+ with `pgvector`).
2. Create a project named `gig-grab`.
3. Copy the pooled connection string into `DATABASE_URL` in the root `.env`.
4. Push the schema:

   ```bash
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
