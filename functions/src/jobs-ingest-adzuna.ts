import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import {
  db,
  employers,
  jobs,
  matches,
  candidates,
  profileCards,
  type NewJob,
} from "@gig-grab/db";
import { eq, sql, inArray, and } from "drizzle-orm";
import { getAuth } from "firebase-admin/auth";

/**
 * Defence in depth: every applyUrl persisted to jobs.structured_brief and
 * later rendered into an <a href> on the dashboard. Adzuna's `redirect_url`
 * is trustworthy in practice but the same column is also written by
 * employer-side voice extraction (transcript-controlled). Reject anything
 * that isn't an absolute http(s) URL so we can't end up with javascript:
 * or data: schemes reaching the DOM.
 */
function safeHttpUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Adzuna search-API client.
 *
 * Why Adzuna: official API (no scraping), free tier covers 1000
 * requests / month, strong UK coverage, returns normalised
 * title/company/location/salary/url. Indeed and LinkedIn forbid
 * scraping in their ToS — we route through partner APIs only.
 *
 * Set ADZUNA_APP_ID + ADZUNA_APP_KEY as env / secrets on the api
 * Cloud Run service. Register at https://developer.adzuna.com.
 */

type AdzunaResult = {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  description?: string;
  redirect_url?: string;
  category?: { tag?: string; label?: string };
  contract_type?: string;
  created?: string;
};

type AdzunaSearchResponse = {
  count?: number;
  results?: AdzunaResult[];
};

const AGGREGATOR_ID = "adzuna-aggregator";
const AGGREGATOR_EMAIL = "aggregator@giggrab.io";
const AGGREGATOR_COMPANY = "Adzuna (aggregated listings)";

/** Idempotent: creates the stub aggregator employer row if missing,
 * returns its id. Jobs reference this id so the schema's FK to employers
 * stays clean. */
async function ensureAggregatorEmployer(): Promise<string> {
  const [existing] = await db()
    .select({ id: employers.id })
    .from(employers)
    .where(eq(employers.id, AGGREGATOR_ID))
    .limit(1);
  if (existing) return existing.id;
  await db()
    .insert(employers)
    .values({
      id: AGGREGATOR_ID,
      email: AGGREGATOR_EMAIL,
      company: AGGREGATOR_COMPANY,
    })
    .onConflictDoNothing();
  return AGGREGATOR_ID;
}

function formatPay(r: AdzunaResult, country: "gb" | "us" = "gb"): string | null {
  const lo = r.salary_min;
  const hi = r.salary_max;
  if (!lo && !hi) return null;
  const isUS = country === "us";
  const symbol = isUS ? "$" : "£";
  const locale = isUS ? "en-US" : "en-GB";
  const fmt = (n: number) => `${symbol}${Math.round(n).toLocaleString(locale)}`;
  if (lo && hi && lo !== hi) return `${fmt(lo)}–${fmt(hi)}`;
  return fmt(lo ?? hi ?? 0);
}

async function jobExistsForAdzunaId(adzunaId: string): Promise<boolean> {
  const rows = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(sql`${jobs.structuredBrief}->>'adzunaId' = ${adzunaId}`)
    .limit(1);
  return rows.length > 0;
}

// Self-bootstrap: ensure the unique index exists so concurrent ingest
// runs can't insert the same Adzuna row twice. Idempotent — no-op when
// the index already exists. Run once per Cloud Run instance.
let adzunaIndexEnsured = false;
async function ensureAdzunaUniqueIndex(): Promise<void> {
  if (adzunaIndexEnsured) return;
  try {
    await db().execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS jobs_adzuna_id_uniq
      ON jobs ((structured_brief->>'adzunaId'))
      WHERE structured_brief->>'source' = 'adzuna'
        AND structured_brief->>'adzunaId' IS NOT NULL
    `);
    adzunaIndexEnsured = true;
  } catch (err) {
    console.warn("[adzuna] could not ensure unique index", err);
  }
}

/**
 * POST /api/jobs/ingest/adzuna?country=gb&what=carpenter&where=manchester
 *
 * Auth: shared secret in `Authorization: Bearer <INGEST_SECRET>` OR
 * `?key=<INGEST_SECRET>` query string. Cloud Scheduler will pass the
 * Authorization header; manual `curl` can use the query string.
 *
 * Inserts up to `results_per_page` new jobs from one Adzuna search.
 * Idempotent — skips rows whose adzunaId already exists. Returns a
 * summary so the caller can decide to fetch more pages.
 */
export async function jobsIngestAdzuna(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureAdzunaUniqueIndex();
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    res.status(500).json({ error: "INGEST_SECRET not configured" });
    return;
  }
  const authz = (req.headers.authorization ?? "") as string;
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  const key = (req.query.key as string | undefined) ?? bearer;
  if (key !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    res.status(503).json({
      error:
        "ADZUNA_APP_ID / ADZUNA_APP_KEY not set. Register at https://developer.adzuna.com and set both as Cloud Run env / secrets.",
    });
    return;
  }

  const countryRaw = String(req.query.country ?? "gb").slice(0, 2).toLowerCase();
  const country: "gb" | "us" = countryRaw === "us" ? "us" : "gb";
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);

  // One-shot backfill: stamp ?backfill=gb (or us) onto every existing
  // adzuna row that's missing a country field. Idempotent — the WHERE
  // clause skips rows already stamped. Lets us upgrade prior ingests
  // without touching the DB directly.
  const backfillCountry = String(req.query.backfill ?? "")
    .slice(0, 2)
    .toLowerCase();
  if (backfillCountry) {
    await db().execute(
      sql`UPDATE jobs SET structured_brief = jsonb_set(structured_brief, '{country}', ${`"${backfillCountry}"`}::jsonb, true)
          WHERE structured_brief->>'source' = 'adzuna'
            AND (structured_brief->>'country' IS NULL OR structured_brief->>'country' = '')`,
    );
    console.log(`[adzuna] backfilled country=${backfillCountry}`);
  }
  const resultsPerPage = Math.min(
    50,
    Math.max(1, Number(req.query.results_per_page ?? 50) || 50),
  );
  const what = String(req.query.what ?? "").slice(0, 100);
  const where = String(req.query.where ?? "").slice(0, 100);

  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`,
  );
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", String(resultsPerPage));
  url.searchParams.set("content-type", "application/json");
  if (what) url.searchParams.set("what", what);
  if (where) url.searchParams.set("where", where);

  let payload: AdzunaSearchResponse;
  try {
    const r = await fetch(url.toString());
    if (!r.ok) {
      const body = await r.text();
      res.status(502).json({
        error: `adzuna ${r.status}`,
        body: body.slice(0, 400),
      });
      return;
    }
    payload = (await r.json()) as AdzunaSearchResponse;
  } catch (err) {
    res.status(502).json({
      error: "adzuna fetch failed",
      detail: err instanceof Error ? err.message : "unknown",
    });
    return;
  }

  const results = payload.results ?? [];
  const employerId = await ensureAggregatorEmployer();

  let inserted = 0;
  let skipped = 0;
  for (const r of results) {
    try {
      const adzunaId = String(r.id ?? "").trim();
      if (!adzunaId) {
        skipped++;
        continue;
      }
      if (await jobExistsForAdzunaId(adzunaId)) {
        skipped++;
        continue;
      }
      const title = (r.title ?? "").trim().slice(0, 240) || "Untitled role";
      const location =
        r.location?.display_name?.trim().slice(0, 240) ||
        (country === "us" ? "USA" : "UK");
      const pay = formatPay(r, country);
      const description = (r.description ?? "").trim().slice(0, 2000);
      const company = (r.company?.display_name ?? "").trim().slice(0, 160);

      const row: NewJob = {
        employerId,
        title,
        location,
        pay,
        shiftPattern: r.contract_type ?? null,
        mustHaves: [],
        dealBreakers: [],
        structuredBrief: {
          adzunaId,
          source: "adzuna",
          country,
          company,
          category: r.category?.label ?? null,
          applyUrl: safeHttpUrl(r.redirect_url),
          description,
          createdAt: r.created ?? null,
        },
        source: "link",
        status: "active",
        requiredCount: 1,
      };
      const [created] = await db()
        .insert(jobs)
        .values(row)
        .returning({ id: jobs.id });
      inserted++;
      // Fire-and-forget embed so the row is searchable to employers.
      // Don't await — keep ingest fast; failure is logged and the
      // refresh-all sweep will pick the row up next pass.
      void (async () => {
        try {
          const { embedJob } = await import("./embeddings");
          await embedJob(created.id);
        } catch (err) {
          console.error("[embed:job] adzuna failed", err);
        }
      })();
    } catch (err) {
      console.error("[adzuna] row insert failed", err);
      skipped++;
    }
  }

  res.json({
    ok: true,
    country,
    page,
    requested: results.length,
    inserted,
    skipped,
    totalForQuery: payload.count ?? null,
  });
}

/**
 * Curated refresh set. One Cloud Scheduler hit calls every query in
 * this list. Add new trades / regions here; the rest of the pipeline
 * picks them up on the next refresh. Each query consumes one Adzuna
 * API call out of the free 1000/month tier — 20 queries × 2 refreshes
 * per day = 1200/month, so the cron should run at most every 12h to
 * stay within budget. Bump to a paid tier if you push it harder.
 */
const REFRESH_QUERIES: Array<{
  country: "gb" | "us";
  what: string;
  where?: string;
}> = [
  // Pilot focus 2026-05-21: Houston construction. Trades + adjacent
  // roles. Broadened 2026-05-23 to add a baseline coverage of NYC,
  // Chicago, LA + a generic tech/office bucket so candidates outside
  // Houston construction (e.g. a NYC CTO testing the dashboard) see
  // SOMETHING in their city instead of an empty feed. Stay within
  // Adzuna free tier (1000 calls/month) — cron runs every 12h, current
  // list = 32 × 2 = 64/day = ~1920/month, will need a paid tier or 24h
  // cadence drop to stay free.
  { country: "us", what: "construction", where: "Houston, TX" },
  { country: "us", what: "construction worker", where: "Houston, TX" },
  { country: "us", what: "construction manager", where: "Houston, TX" },
  { country: "us", what: "carpenter", where: "Houston, TX" },
  { country: "us", what: "electrician", where: "Houston, TX" },
  { country: "us", what: "plumber", where: "Houston, TX" },
  { country: "us", what: "welder", where: "Houston, TX" },
  { country: "us", what: "concrete", where: "Houston, TX" },
  { country: "us", what: "framer", where: "Houston, TX" },
  { country: "us", what: "drywall", where: "Houston, TX" },
  { country: "us", what: "roofer", where: "Houston, TX" },
  { country: "us", what: "HVAC", where: "Houston, TX" },
  { country: "us", what: "heavy equipment operator", where: "Houston, TX" },
  { country: "us", what: "site superintendent", where: "Houston, TX" },
  { country: "us", what: "project manager construction", where: "Houston, TX" },
  { country: "us", what: "estimator construction", where: "Houston, TX" },
  { country: "us", what: "general laborer", where: "Houston, TX" },
  { country: "us", what: "pipefitter", where: "Houston, TX" },
  // NYC coverage — construction trades + tech baseline.
  { country: "us", what: "construction", where: "New York, NY" },
  { country: "us", what: "carpenter", where: "New York, NY" },
  { country: "us", what: "electrician", where: "New York, NY" },
  { country: "us", what: "plumber", where: "New York, NY" },
  { country: "us", what: "software engineer", where: "New York, NY" },
  { country: "us", what: "full stack developer", where: "New York, NY" },
  { country: "us", what: "product manager", where: "New York, NY" },
  // Other top US metros, construction only (the pilot lane).
  { country: "us", what: "construction", where: "Los Angeles, CA" },
  { country: "us", what: "construction", where: "Chicago, IL" },
  { country: "us", what: "construction", where: "Dallas, TX" },
  { country: "us", what: "construction", where: "Phoenix, AZ" },
  { country: "us", what: "construction", where: "Atlanta, GA" },
  // UK baseline — pilot has UK candidates from prior cohort; one
  // generic query per major city gives them non-zero coverage.
  { country: "gb", what: "construction", where: "London" },
  { country: "gb", what: "construction", where: "Manchester" },
];

/**
 * POST /api/jobs/ingest/adzuna/refresh-all
 *
 * Auth: Authorization: Bearer <INGEST_SECRET> (or ?key=). Loops the
 * REFRESH_QUERIES set and runs the same per-query insert logic
 * jobsIngestAdzuna uses. Idempotent — repeat calls only insert new
 * Adzuna IDs. Designed to be called by Cloud Scheduler every 12h.
 *
 * Returns a summary { results: [{country, what, inserted, skipped,
 * error?}, ...] } so the schedule's logs show what actually changed.
 */
export async function jobsIngestAdzunaRefreshAll(
  req: Request,
  res: Response,
): Promise<void> {
  await ensureAdzunaUniqueIndex();
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    res.status(500).json({ error: "INGEST_SECRET not configured" });
    return;
  }
  const authz = (req.headers.authorization ?? "") as string;
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  const key = (req.query.key as string | undefined) ?? bearer;
  if (key !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    res.status(503).json({ error: "Adzuna keys not set" });
    return;
  }

  const employerId = await ensureAggregatorEmployer();

  const results: Array<{
    country: string;
    what: string;
    inserted: number;
    skipped: number;
    error?: string;
  }> = [];
  let totalInserted = 0;

  for (const q of REFRESH_QUERIES) {
    let inserted = 0;
    let skipped = 0;
    try {
      const url = new URL(
        `https://api.adzuna.com/v1/api/jobs/${q.country}/search/1`,
      );
      url.searchParams.set("app_id", appId);
      url.searchParams.set("app_key", appKey);
      url.searchParams.set("results_per_page", "50");
      url.searchParams.set("content-type", "application/json");
      url.searchParams.set("what", q.what);
      if (q.where) url.searchParams.set("where", q.where);

      const r = await fetch(url.toString());
      if (!r.ok) {
        results.push({
          country: q.country,
          what: q.what,
          inserted: 0,
          skipped: 0,
          error: `adzuna ${r.status}`,
        });
        continue;
      }
      const payload = (await r.json()) as AdzunaSearchResponse;
      const rows = payload.results ?? [];

      for (const row of rows) {
        const adzunaId = String(row.id ?? "").trim();
        if (!adzunaId) {
          skipped++;
          continue;
        }
        if (await jobExistsForAdzunaId(adzunaId)) {
          skipped++;
          continue;
        }
        const title =
          (row.title ?? "").trim().slice(0, 240) || "Untitled role";
        const location =
          row.location?.display_name?.trim().slice(0, 240) ||
          (q.country === "us" ? "USA" : "UK");
        const pay = formatPay(row, q.country);
        const description = (row.description ?? "").trim().slice(0, 2000);
        const company = (row.company?.display_name ?? "").trim().slice(0, 160);
        const insertRow: NewJob = {
          employerId,
          title,
          location,
          pay,
          shiftPattern: row.contract_type ?? null,
          mustHaves: [],
          dealBreakers: [],
          structuredBrief: {
            adzunaId,
            source: "adzuna",
            country: q.country,
            company,
            category: row.category?.label ?? null,
            applyUrl: safeHttpUrl(row.redirect_url),
            description,
            createdAt: row.created ?? null,
          },
          source: "link",
          status: "active",
          requiredCount: 1,
        };
        try {
          const [created] = await db()
            .insert(jobs)
            .values(insertRow)
            .returning({ id: jobs.id });
          inserted++;
          totalInserted++;
          void (async () => {
            try {
              const { embedJob } = await import("./embeddings");
              await embedJob(created.id);
            } catch (err) {
              console.error("[embed:job] adzuna-refresh failed", err);
            }
          })();
        } catch (err) {
          console.error("[adzuna-refresh] row insert failed", err);
          skipped++;
        }
      }
      results.push({
        country: q.country,
        what: q.what,
        inserted,
        skipped,
      });
    } catch (err) {
      results.push({
        country: q.country,
        what: q.what,
        inserted,
        skipped,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  console.log(
    `[adzuna-refresh] done — ${REFRESH_QUERIES.length} queries, ${totalInserted} new jobs`,
  );
  res.json({ ok: true, totalInserted, results });
}

/**
 * GET /api/account/jobs?limit=20
 *
 * Auth: Firebase ID token in Authorization Bearer. Returns the latest
 * active jobs for the signed-in candidate. Today: just ranks by created
 * descending. Phase 2 will plug in pgvector matching against the
 * candidate's profile embedding.
 */
export async function accountJobsList(
  req: Request,
  res: Response,
): Promise<void> {
  const authz = (req.headers.authorization ?? "") as string;
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(tok);
    uid = decoded.uid;
  } catch {
    res.status(401).json({ error: "invalid token" });
    return;
  }

  const limit = Math.min(
    50,
    Math.max(1, Number(req.query.limit ?? 20) || 20),
  );
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  const country = String(req.query.country ?? "").slice(0, 2).toLowerCase();
  const appliedOnly = String(req.query.applied ?? "") === "1";
  const q = String(req.query.q ?? "").trim().slice(0, 120);
  const gigOnly = String(req.query.gigOnly ?? "") === "1";
  // Recency filter in days. Empty / non-numeric = no filter.
  const recencyDays = Number(req.query.recency ?? 0);

  const [me] = await db()
    .select({
      id: candidates.id,
      profileEmbedding: candidates.profileEmbedding,
      profileLocation: profileCards.location,
    })
    .from(candidates)
    .leftJoin(profileCards, eq(profileCards.candidateId, candidates.id))
    .where(eq(candidates.firebaseUid, uid))
    .limit(1);

  // Candidate city for location-aware ranking. profile_cards.location is
  // free text from Sarah's intake — typically "New York City" or
  // "Houston, TX" or "Manchester, UK". Take the first comma-split chunk
  // as the city so "Houston, TX" matches jobs.location of "Houston" /
  // "Houston, Texas" / "Addicks, Houston". <3 chars treated as missing.
  const candidateCity = (me?.profileLocation ?? "")
    .split(",")[0]
    .trim()
    .slice(0, 80);
  const useCityFilter = candidateCity.length >= 3;

  // Shared WHERE conditions used by both the primary query and the
  // similar-jobs fallback.
  const baseConds = [eq(jobs.status, "active")];
  if (country === "gb" || country === "us") {
    baseConds.push(sql`structured_brief->>'country' = ${country}`);
  }
  if (gigOnly) {
    // 'voice' = GigGrab employer voice-intake; 'upload' = first-party uploads.
    baseConds.push(sql`${jobs.source} IN ('voice','upload')`);
  }
  if (
    Number.isFinite(recencyDays) &&
    recencyDays > 0 &&
    recencyDays <= 365
  ) {
    baseConds.push(
      sql`${jobs.createdAt} > now() - (${recencyDays} || ' days')::interval`,
    );
  }

  const conditions = [...baseConds];
  if (appliedOnly) {
    if (!me) {
      res.json({
        jobs: [],
        country: country || "all",
        mode: "applied",
        q,
        hasMore: false,
        totalCount: 0,
      });
      return;
    }
    conditions.push(sql`${jobs.id} IN (
      SELECT job_id FROM matches
      WHERE candidate_id = ${me.id} AND status = 'applied'
    )`);
  }
  if (q.length > 0) {
    const like = `%${q}%`;
    conditions.push(
      sql`(${jobs.title} ILIKE ${like}
        OR structured_brief->>'company' ILIKE ${like}
        OR structured_brief->>'description' ILIKE ${like}
        OR ${jobs.location} ILIKE ${like})`,
    );
  }

  // Mode label tells the UI how to header the list:
  //   'exact'                 — text search hits
  //   'similar'               — text search empty → embedding fallback
  //   'personalized'          — no q, candidate has embedding → cosine to profile
  //   'personalized_local'    — same as personalized, restricted to candidate's city
  //   'personalized_nationwide' — city filter returned 0, dropped to country-wide
  //   'recent'                — no q, no embedding → createdAt desc
  //   'applied'               — appliedOnly filter
  let mode:
    | "exact"
    | "similar"
    | "personalized"
    | "personalized_local"
    | "personalized_nationwide"
    | "recent"
    | "applied" = appliedOnly ? "applied" : q.length > 0 ? "exact" : "recent";

  // Location-aware filter for the personalized feed (no explicit text
  // query, no applied filter). If the candidate has a city on file,
  // restrict to that city first; if 0 results, drop the filter and
  // label the response so the UI can explain.
  const cityCondLike = useCityFilter ? `%${candidateCity}%` : null;
  if (cityCondLike && !appliedOnly && !q) {
    conditions.push(sql`${jobs.location} ILIKE ${cityCondLike}`);
  }

  // Hybrid ranking. When the candidate has a profile embedding we
  // ALWAYS personalize the order (even on exact text matches) so a
  // carpenter searching 'manchester' sees carpenter-in-manchester first.
  // When they don't have an embedding, fall back to createdAt desc for
  // exact + recent, and to the query embedding for the similar fallback.
  let orderClause = sql`${jobs.createdAt} desc`;
  let usedCandidateEmbedding = false;
  if (me?.profileEmbedding) {
    const vec = sql`'[${sql.raw(me.profileEmbedding.join(","))}]'::vector`;
    orderClause = sql`(jobs.embedding <=> ${vec})`;
    usedCandidateEmbedding = true;
    if (!q && !appliedOnly) {
      mode = cityCondLike ? "personalized_local" : "personalized";
    }
  }

  // Total count for "showing 1–20 of N". Cheap COUNT(*) on the same WHERE.
  let [{ n: totalCount }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(sql.join(conditions, sql` AND `));

  // City filter returned nothing — drop the city restriction and label
  // the result so the UI can surface "no jobs in {city} yet — showing
  // closest matches elsewhere".
  let activeConditions = conditions;
  if (cityCondLike && !appliedOnly && !q && totalCount === 0) {
    activeConditions = conditions.slice(0, -1);
    mode = "personalized_nationwide";
    const [{ n: fallbackCount }] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(sql.join(activeConditions, sql` AND `));
    totalCount = fallbackCount;
  }

  let rows = await db()
    .select({
      id: jobs.id,
      title: jobs.title,
      location: jobs.location,
      pay: jobs.pay,
      shiftPattern: jobs.shiftPattern,
      structuredBrief: jobs.structuredBrief,
      source: jobs.source,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(sql.join(activeConditions, sql` AND `))
    .orderBy(orderClause)
    .limit(limit)
    .offset(offset);

  // Similar-jobs fallback. Only when explicit text search returned
  // nothing — never on an empty personalized feed. We embed the query
  // (lighter signal than a full profile) and pull the K nearest active
  // jobs honouring the same country / gigOnly / recency filters.
  if (rows.length === 0 && q && !appliedOnly) {
    try {
      const { embedText } = await import("./embeddings");
      const qvec = await embedText(q);
      if (qvec) {
        const vec = sql`'[${sql.raw(qvec.join(","))}]'::vector`;
        const fbConds = [...baseConds, sql`embedding IS NOT NULL`];
        // Re-blend: order by AVG(query distance, candidate-profile
        // distance) when we have both. Otherwise just query distance.
        let fbOrder = sql`embedding <=> ${vec}`;
        if (usedCandidateEmbedding && me?.profileEmbedding) {
          const pvec = sql`'[${sql.raw(me.profileEmbedding.join(","))}]'::vector`;
          fbOrder = sql`((embedding <=> ${vec}) + (embedding <=> ${pvec})) / 2`;
        }
        rows = await db()
          .select({
            id: jobs.id,
            title: jobs.title,
            location: jobs.location,
            pay: jobs.pay,
            shiftPattern: jobs.shiftPattern,
            structuredBrief: jobs.structuredBrief,
            source: jobs.source,
            createdAt: jobs.createdAt,
          })
          .from(jobs)
          .where(sql.join(fbConds, sql` AND `))
          .orderBy(fbOrder)
          .limit(limit);
        if (rows.length > 0) mode = "similar";
      }
    } catch (err) {
      console.error("[jobs/list] similar-jobs fallback failed", err);
    }
  }

  // Stitch the signed-in user's apply state onto each row. Cheap single
  // JOIN-equivalent: one extra query that filters matches to the rows
  // we're about to return. `me` was already resolved above for the
  // appliedOnly filter.
  const jobIds = rows.map((r) => r.id);
  const appliedJobIds = new Set<string>();
  if (me && jobIds.length > 0) {
    const appliedRows = await db()
      .select({ jobId: matches.jobId })
      .from(matches)
      .where(
        and(
          eq(matches.candidateId, me.id),
          eq(matches.status, "applied"),
          inArray(matches.jobId, jobIds),
        ),
      );
    for (const r of appliedRows) appliedJobIds.add(r.jobId);
  }

  const out = rows.map((r) => {
    const brief = (r.structuredBrief ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      title: r.title,
      company: (brief.company as string) ?? null,
      location: r.location,
      pay: r.pay,
      shiftPattern: r.shiftPattern,
      // `source` on the row is the canonical enum (voice|upload|link|ats).
      // brief.source is legacy free-text — prefer the enum.
      source: r.source ?? (brief.source as string) ?? null,
      country: (brief.country as string) ?? null,
      applyUrl: safeHttpUrl(brief.applyUrl),
      createdAt: r.createdAt,
      applied: appliedJobIds.has(r.id),
    };
  });

  res.json({
    jobs: out,
    country: country || "all",
    mode,
    q,
    totalCount,
    candidateCity: useCityFilter ? candidateCity : null,
    hasMore: offset + rows.length < totalCount && mode !== "similar",
  });
}

/**
 * POST /api/account/jobs/:jobId/apply
 *
 * Auth: Firebase ID token. Idempotent — re-applying is a no-op. Writes
 * a row into `matches` with status='applied'. Used both by the web
 * "Apply" button and (future) by the agent when a caller signals
 * intent to apply during a hotline call.
 */
export async function accountJobsApply(
  req: Request,
  res: Response,
  jobId: string,
): Promise<void> {
  const authz = (req.headers.authorization ?? "") as string;
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(tok);
    uid = decoded.uid;
  } catch {
    res.status(401).json({ error: "invalid token" });
    return;
  }

  const { ensureBillingSchema } = await import("./billing");
  await ensureBillingSchema();

  const [me] = await db()
    .select({
      id: candidates.id,
      applicationsRemaining: candidates.applicationsRemaining,
      billingTier: candidates.billingTier,
      billingStatus: candidates.billingStatus,
    })
    .from(candidates)
    .where(eq(candidates.firebaseUid, uid))
    .limit(1);
  if (!me) {
    res.status(404).json({ error: "no candidate row" });
    return;
  }

  // Idempotency: if this candidate already has an `applied` row for
  // this job, the call is a no-op — don't decrement the quota again.
  const [existingMatch] = await db()
    .select({ status: matches.status })
    .from(matches)
    .where(and(eq(matches.candidateId, me.id), eq(matches.jobId, jobId)))
    .limit(1);
  const alreadyApplied = existingMatch?.status === "applied";

  if (!alreadyApplied) {
    // Quota gate. No subscription OR no remaining apps → 402 Payment
    // Required. UI redirects to /pricing.
    if (!me.billingTier || me.applicationsRemaining <= 0) {
      res.status(402).json({
        error: "quota_exceeded",
        tier: me.billingTier,
        applicationsRemaining: me.applicationsRemaining,
        upgradeUrl: "/pricing",
      });
      return;
    }
  }

  const [j] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!j) {
    res.status(404).json({ error: "job not found" });
    return;
  }

  const via = (req.body?.via ?? "web") === "phone" ? "phone" : "web";

  await db()
    .insert(matches)
    .values({
      candidateId: me.id,
      jobId: j.id,
      score: "1.000",
      whyRanked: `Manual apply via ${via}`,
      status: "applied",
    })
    .onConflictDoUpdate({
      target: [matches.candidateId, matches.jobId],
      set: { status: "applied", updatedAt: new Date() },
    });

  // Decrement quota only on first apply.
  let remaining = me.applicationsRemaining;
  if (!alreadyApplied) {
    const [updated] = await db()
      .update(candidates)
      .set({
        applicationsRemaining: sql`GREATEST(0, ${candidates.applicationsRemaining} - 1)`,
      })
      .where(eq(candidates.id, me.id))
      .returning({ applicationsRemaining: candidates.applicationsRemaining });
    remaining = updated?.applicationsRemaining ?? remaining;
  }

  console.log(
    `[apply] candidate=${me.id.slice(0, 8)} job=${j.id.slice(0, 8)} via=${via} remaining=${remaining}`,
  );
  res.json({
    ok: true,
    applied: true,
    applicationsRemaining: remaining,
    tier: me.billingTier,
  });
}
