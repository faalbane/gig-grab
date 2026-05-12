import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import {
  db,
  employers,
  jobs,
  type NewJob,
} from "@gig-grab/db";
import { eq, sql } from "drizzle-orm";

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
const AGGREGATOR_EMAIL = "aggregator@gitgrab.io";
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
          applyUrl: r.redirect_url ?? null,
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
  // Lazy import to keep this file's compile small.
  const { getAuth } = await import("firebase-admin/auth");
  const authz = (req.headers.authorization ?? "") as string;
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  try {
    await getAuth().verifyIdToken(tok);
  } catch {
    res.status(401).json({ error: "invalid token" });
    return;
  }

  const limit = Math.min(
    50,
    Math.max(1, Number(req.query.limit ?? 20) || 20),
  );
  const country = String(req.query.country ?? "").slice(0, 2).toLowerCase();

  const conditions = [eq(jobs.status, "active")];
  if (country === "gb" || country === "us") {
    conditions.push(sql`structured_brief->>'country' = ${country}`);
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
      applyUrl: (brief.applyUrl as string) ?? null,
      createdAt: r.createdAt,
    };
  });

  res.json({ jobs: out, country: country || "all" });
}
