import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import {
  db,
  employers,
  jobs,
  matches,
  candidates,
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

function formatPay(r: AdzunaResult): string | null {
  const lo = r.salary_min;
  const hi = r.salary_max;
  if (!lo && !hi) return null;
  const fmt = (n: number) =>
    `£${Math.round(n).toLocaleString("en-GB")}`;
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

  const country = String(req.query.country ?? "gb").slice(0, 2).toLowerCase();
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
        r.location?.display_name?.trim().slice(0, 240) || "UK";
      const pay = formatPay(r);
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
      await db().insert(jobs).values(row);
      inserted++;
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
  // UK
  { country: "gb", what: "carpenter" },
  { country: "gb", what: "electrician" },
  { country: "gb", what: "plumber" },
  { country: "gb", what: "nurse" },
  { country: "gb", what: "chef" },
  { country: "gb", what: "hgv driver" },
  { country: "gb", what: "warehouse" },
  { country: "gb", what: "care worker" },
  { country: "gb", what: "software engineer" },
  { country: "gb", what: "product designer" },
  // US
  { country: "us", what: "carpenter" },
  { country: "us", what: "electrician" },
  { country: "us", what: "plumber" },
  { country: "us", what: "nurse" },
  { country: "us", what: "chef" },
  { country: "us", what: "truck driver" },
  { country: "us", what: "warehouse" },
  { country: "us", what: "home health aide" },
  { country: "us", what: "software engineer" },
  { country: "us", what: "product designer" },
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
        const pay = formatPay(row);
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
          await db().insert(jobs).values(insertRow);
          inserted++;
          totalInserted++;
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
  const country = String(req.query.country ?? "").slice(0, 2).toLowerCase();
  const appliedOnly = String(req.query.applied ?? "") === "1";

  // Resolve the signed-in candidate once so we can both (a) restrict to
  // their applied set when appliedOnly is set, and (b) stitch the
  // applied flag onto every returned row.
  const [me] = await db()
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.firebaseUid, uid))
    .limit(1);

  const conditions = [eq(jobs.status, "active")];
  if (country === "gb" || country === "us") {
    conditions.push(sql`structured_brief->>'country' = ${country}`);
  }
  if (appliedOnly) {
    if (!me) {
      res.json({ jobs: [], country: country || "all" });
      return;
    }
    conditions.push(sql`${jobs.id} IN (
      SELECT job_id FROM matches
      WHERE candidate_id = ${me.id} AND status = 'applied'
    )`);
  }

  const rows = await db()
    .select({
      id: jobs.id,
      title: jobs.title,
      location: jobs.location,
      pay: jobs.pay,
      shiftPattern: jobs.shiftPattern,
      structuredBrief: jobs.structuredBrief,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`${jobs.createdAt} desc`)
    .limit(limit);

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
      source: (brief.source as string) ?? null,
      country: (brief.country as string) ?? null,
      applyUrl: safeHttpUrl(brief.applyUrl),
      createdAt: r.createdAt,
      applied: appliedJobIds.has(r.id),
    };
  });

  res.json({ jobs: out, country: country || "all" });
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

  const [me] = await db()
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.firebaseUid, uid))
    .limit(1);
  if (!me) {
    res.status(404).json({ error: "no candidate row" });
    return;
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

  console.log(
    `[apply] candidate=${me.id.slice(0, 8)} job=${j.id.slice(0, 8)} via=${via}`,
  );
  res.json({ ok: true, applied: true });
}
