import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import {
  db,
  candidates,
  sessions,
  jobs,
  profileCards,
  transcriptTurns,
} from "@gig-grab/db";
import { asc, eq, isNull, sql, desc } from "drizzle-orm";
import { extractProfile } from "./profile";
import { extractEmployerJob } from "./employer-extraction";
import {
  classifyAudience,
  persistAudience,
  maybeFlipSessionKind,
} from "./intent";
import { embedCandidate, embedJob } from "./embeddings";

// Per-session in-memory cooldown for /admin/rerun-extract. Cloud Run
// horizontal scale means this isn't bulletproof — but limits a leaked
// INGEST_SECRET to N×(sessions/hour) extractions across N instances
// rather than unlimited.
const rerunCooldowns = new Map<string, number>();
const RERUN_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * POST /api/admin/rerun-extract/:sessionId
 *
 * Re-runs the post-call extraction pipeline for a session. Useful when the
 * original Twilio status callback hit a mismatched URL and the extract
 * never ran, or when a transient Anthropic failure dropped the result.
 *
 * Auth: shared INGEST_SECRET in `x-ingest-secret` header (same one as the
 * Adzuna ingest endpoint). Not for end-user traffic.
 */
export async function adminRerunExtract(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }

  const [row] = await db()
    .select({
      kind: sessions.kind,
      candidateId: sessions.candidateId,
      status: sessions.status,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  // Only completed sessions are worth re-extracting. Running on
  // in-progress / ringing sessions is paid Anthropic work that the
  // post-call dispatcher will redo anyway.
  if (!row.endedAt || row.status === "ringing" || row.status === "in_progress") {
    res.status(409).json({ error: "session not completed" });
    return;
  }
  // Per-session cooldown: at most one rerun per hour. Defends against an
  // INGEST_SECRET leak being replayed to fan out paid extractions.
  const cooldown = rerunCooldowns.get(sessionId) ?? 0;
  if (Date.now() - cooldown < RERUN_COOLDOWN_MS) {
    res.status(429).json({ error: "rerun_cooldown" });
    return;
  }
  rerunCooldowns.set(sessionId, Date.now());

  try {
    if (row.kind === "employer_intake") {
      await extractEmployerJob(sessionId);
      res.json({ ok: true, mode: "employer_intake" });
      return;
    }

    if (!row.candidateId) {
      await extractProfile(sessionId);
      res.json({ ok: true, mode: "candidate_intake_no_cand" });
      return;
    }

    const [cand] = await db()
      .select({ matchSignals: candidates.matchSignals })
      .from(candidates)
      .where(eq(candidates.id, row.candidateId))
      .limit(1);
    const cached = cand?.matchSignals?.audience;
    let audience: "worker" | "employer";
    if (cached === "worker" || cached === "employer") {
      audience = cached;
    } else {
      audience = await classifyAudience(sessionId);
      await persistAudience(row.candidateId, audience);
      await maybeFlipSessionKind(sessionId, audience);
    }
    if (audience === "employer") {
      await extractEmployerJob(sessionId);
    } else {
      await extractProfile(sessionId);
    }
    res.json({ ok: true, mode: audience });
  } catch (err) {
    console.error("[admin/rerun-extract] failed", err);
    res.status(500).json({ error: "extraction failed" });
  }
}

/**
 * POST /api/admin/embed-backfill?kind=candidates|jobs|all&limit=200
 *
 * Backfills embeddings for rows where the vector column is NULL.
 * Needed once after OPENAI_API_KEY is provisioned, since the auto-embed
 * hooks only fire on NEW writes (extract / manual edit / ingest).
 *
 * Auth: same INGEST_SECRET header as the other admin endpoints. NOT for
 * end-user traffic.
 */
export async function adminEmbedBackfill(
  req: Request,
  res: Response,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    return;
  }

  const kind = (req.query.kind as string | undefined) ?? "all";
  const limit = Math.min(
    1000,
    Math.max(1, Number(req.query.limit ?? 200) || 200),
  );

  let candidatesDone = 0;
  let jobsDone = 0;

  if (kind === "candidates" || kind === "all") {
    // Embed every profile_card whose candidate's profile_embedding is null.
    const rows = await db()
      .select({ candidateId: profileCards.candidateId })
      .from(profileCards)
      .innerJoin(candidates, eq(candidates.id, profileCards.candidateId))
      .where(isNull(candidates.profileEmbedding))
      .limit(limit);
    for (const r of rows) {
      try {
        await embedCandidate(r.candidateId);
        candidatesDone++;
      } catch (err) {
        console.error(`[backfill:candidate] ${r.candidateId} failed`, err);
      }
    }
  }

  if (kind === "jobs" || kind === "all") {
    const rows = await db()
      .select({ id: jobs.id })
      .from(jobs)
      .where(isNull(jobs.embedding))
      .limit(limit);
    for (const r of rows) {
      try {
        await embedJob(r.id);
        jobsDone++;
      } catch (err) {
        console.error(`[backfill:job] ${r.id} failed`, err);
      }
    }
  }

  res.json({ ok: true, candidatesEmbedded: candidatesDone, jobsEmbedded: jobsDone });
}

/**
 * POST /api/admin/jobs/pause-source?source=adzuna
 *
 * Soft-delete: sets status='paused' on all jobs with the given source.
 * Reversible — toggle them back via PATCH employer/jobs/:id (employer
 * action) or another admin pass. Use this when retiring a feed (e.g.
 * pivoting Adzuna ingest from UK trades to Houston construction; the
 * old UK trade jobs should be hidden from the candidate feed without
 * burning the historical data).
 *
 * Optional ?keepHoustonConstruction=1 keeps active any adzuna job
 * whose location contains "Houston" — useful right after retargeting
 * so the new Houston pulls don't get clobbered by the same sweep.
 */
/**
 * POST /api/admin/jobs/fix-currency
 * One-off: rewrite leading `£` to `$` on active jobs whose
 * structured_brief->>'country' is 'us'. Earlier formatPay always
 * stamped £ regardless of country.
 */
/**
 * POST /api/admin/db/create-readonly-user
 *   ?username=studytaco_reader&password=...
 *
 * One-shot: creates (or updates) a read-only Postgres role with SELECT
 * on all current + future tables in the public schema. Used to grant
 * analysts (e.g. support@studytaco.com) read access without giving
 * them the app-side connection string.
 *
 * Auth: INGEST_SECRET header. Idempotent: running again resets the
 * password and re-grants.
 */
/**
 * POST /api/admin/billing/seed-free-tier
 * One-shot: every candidate currently sitting on
 * applications_remaining=0 AND billing_tier IS NULL gets seeded with
 * the free-tier 10 applications. Safe to re-run; subscribed users are
 * untouched.
 */
/**
 * GET /api/admin/stats — PII-free head-counts across the app.
 * Auth: INGEST_SECRET. Safe to share in any log / chat / dashboard.
 */
/**
 * GET /api/admin/recording/:sessionId.mp3
 * Proxies the Twilio recording mp3 with our account credentials so
 * the admin web UI can play it without exposing Twilio account
 * credentials to the browser. INGEST_SECRET gated.
 */
export async function adminRecordingProxy(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  // Accept the secret via header (server-side calls) OR query string
  // (browser <audio src=...> tags can't set custom headers).
  const got =
    (req.header("x-ingest-secret") ?? "") ||
    String(req.query.k ?? "");
  if (!expected || got !== expected) {
    res.status(401).send();
    return;
  }
  const [s] = await db()
    .select({ audioUrl: sessions.audioUrl })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!s?.audioUrl) {
    res.status(404).send();
    return;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) {
    res.status(500).send();
    return;
  }
  const upstream = await fetch(s.audioUrl, {
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"),
    },
  });
  if (!upstream.ok || !upstream.body) {
    console.error("[recording/proxy] twilio non-2xx", upstream.status);
    res.status(502).send();
    return;
  }
  res.setHeader("Content-Type", "audio/mpeg");
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.status(200).send(buf);
}

/**
 * GET /api/admin/sessions/recent?limit=30&kind=candidate_intake
 * Lists recent sessions for the team transcript-review UI. PII
 * minimised — phone is masked to last 4 digits.
 */
export async function adminSessionsRecent(
  req: Request,
  res: Response,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  const limit = Math.min(
    100,
    Math.max(1, Number(req.query.limit ?? 30) || 30),
  );
  const kindFilter = String(req.query.kind ?? "").trim();
  const r = await db().execute(sql`
    SELECT
      s.id,
      s.kind,
      s.status,
      s.started_at,
      s.ended_at,
      EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int AS duration_seconds,
      s.candidate_id,
      c.phone AS phone,
      pc.name AS name,
      pc.title AS title,
      pc.years_experience AS years,
      pc.location AS location,
      (SELECT COUNT(*)::int FROM transcript_turns t WHERE t.session_id = s.id) AS turn_count
    FROM sessions s
    LEFT JOIN candidates c ON c.id = s.candidate_id
    LEFT JOIN profile_cards pc ON pc.candidate_id = s.candidate_id
    ${kindFilter ? sql`WHERE s.kind = ${kindFilter}` : sql``}
    ORDER BY s.started_at DESC
    LIMIT ${limit}
  `);
  const rows = r as unknown as Array<Record<string, unknown>>;
  res.json({
    ok: true,
    sessions: rows.map((row) => {
      const phone = String(row.phone ?? "");
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationSeconds: row.duration_seconds,
        candidateId: row.candidate_id,
        // Mask phone to last 4 for safer team viewing.
        phoneMasked: phone
          ? `${phone.startsWith("+") ? phone.slice(0, 3) : "***"}…${phone.slice(-4)}`
          : null,
        name: row.name ?? null,
        title: row.title ?? null,
        years: row.years ?? null,
        location: row.location ?? null,
        turnCount: row.turn_count,
      };
    }),
  });
}

export async function adminStats(
  req: Request,
  res: Response,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  const r = await db().execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM candidates) AS total_candidates,
      (SELECT COUNT(*)::int FROM candidates WHERE firebase_uid IS NOT NULL) AS candidates_signed_in,
      (SELECT COUNT(*)::int FROM profile_cards) AS candidates_with_profile,
      (SELECT COUNT(*)::int FROM candidates WHERE billing_tier IS NOT NULL) AS candidates_subscribed,
      (SELECT COUNT(*)::int FROM employers) AS total_employers,
      (SELECT COUNT(*)::int FROM employers WHERE firebase_uid IS NOT NULL) AS employers_signed_in,
      (SELECT COUNT(*)::int FROM employers WHERE placement_inquiry_at IS NOT NULL) AS employer_callback_requests,
      (SELECT COUNT(*)::int FROM jobs) AS total_jobs,
      (SELECT COUNT(*)::int FROM jobs WHERE status = 'active') AS active_jobs,
      (SELECT COUNT(*)::int FROM jobs WHERE status = 'paused') AS paused_jobs,
      (SELECT COUNT(*)::int FROM jobs WHERE structured_brief->>'country' = 'us' AND location ILIKE '%Houston%') AS houston_jobs,
      (SELECT COUNT(*)::int FROM sessions WHERE status = 'completed') AS completed_calls,
      (SELECT COUNT(*)::int FROM transcript_turns) AS total_turns,
      (SELECT COUNT(*)::int FROM matches WHERE status = 'applied') AS total_applications,
      (SELECT COUNT(*)::int FROM matches WHERE status = 'shortlisted') AS total_shortlists,
      (SELECT COUNT(*)::int FROM matches WHERE status = 'screened') AS total_interview_requests
  `);
  const rows = (r as unknown as Array<Record<string, unknown>>);
  res.json({ ok: true, stats: rows[0] ?? {} });
}

export async function adminSeedFreeTier(
  req: Request,
  res: Response,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  const { ensureBillingSchema } = await import("./billing");
  await ensureBillingSchema();
  const r = await db().execute(sql`
    UPDATE candidates
       SET applications_remaining = 10
     WHERE applications_remaining = 0
       AND billing_tier IS NULL
  `);
  const updated = (r as unknown as { rowCount?: number }).rowCount ?? 0;
  res.json({ ok: true, updated });
}

export async function adminCreateReadonlyUser(
  req: Request,
  res: Response,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  const usernameRaw = String(req.query.username ?? "").trim();
  const password = String(req.query.password ?? "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,40}$/.test(usernameRaw)) {
    res.status(400).json({ error: "bad username (a-z, 0-9, _, 3-40)" });
    return;
  }
  if (password.length < 16) {
    res.status(400).json({ error: "password must be >= 16 chars" });
    return;
  }

  // Bind both username + password as raw because we've already
  // validated their shape above and need them inside DO/EXECUTE bodies
  // where prepared-statement parameters aren't supported.
  const safeUser = usernameRaw.replace(/"/g, '""');
  const safePw = password.replace(/'/g, "''");

  try {
    // Check existence first via parameterised SELECT, then issue the
    // create/alter as a raw statement.
    const exists = await db().execute(
      sql`SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${usernameRaw}`,
    );
    const rows = (exists as unknown as Array<unknown>).length > 0;
    if (!rows) {
      await db().execute(
        sql.raw(`CREATE ROLE "${safeUser}" LOGIN PASSWORD '${safePw}'`),
      );
    } else {
      await db().execute(
        sql.raw(`ALTER ROLE "${safeUser}" LOGIN PASSWORD '${safePw}'`),
      );
    }
    await db().execute(
      sql.raw(`GRANT CONNECT ON DATABASE "postgres" TO "${safeUser}"`),
    );
    await db().execute(
      sql.raw(`GRANT USAGE ON SCHEMA public TO "${safeUser}"`),
    );
    await db().execute(
      sql.raw(
        `GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${safeUser}"`,
      ),
    );
    await db().execute(
      sql.raw(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "${safeUser}"`,
      ),
    );
    res.json({ ok: true, username: usernameRaw, existed: rows });
  } catch (err) {
    console.error("[admin/create-readonly-user] failed", err);
    res.status(500).json({ error: "create_failed", message: String(err) });
  }
}

export async function adminFixCurrency(
  req: Request,
  res: Response,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  // Use chr(163) so we don't depend on the source-file encoding of £
  // matching the DB row's encoding byte-for-byte.
  const filter = sql`
    pay LIKE '%' || chr(163) || '%' AND (
      structured_brief->>'country' = 'us'
      OR location ILIKE '%USA%'
      OR location ILIKE '%, TX%'
      OR location ILIKE '%, NY%'
      OR location ILIKE '%, CA%'
      OR location ILIKE '%, FL%'
      OR location ILIKE '%, IL%'
      OR location ILIKE '%Houston%'
    )
  `;
  const [{ n: before }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(sql`${filter}`);

  await db().execute(sql`
    UPDATE jobs
    SET pay = REPLACE(pay, chr(163), '$'),
        updated_at = now()
    WHERE ${filter}
  `);

  const [{ n: after }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(sql`${filter}`);

  // Debug breakdown — figure out which side of the AND is zero.
  const [debug] = await db()
    .select({
      payHasPound: sql<number>`count(*) FILTER (WHERE pay LIKE '%' || chr(163) || '%')::int`,
      payHasDollar: sql<number>`count(*) FILTER (WHERE pay LIKE '%$%')::int`,
      countryUs: sql<number>`count(*) FILTER (WHERE structured_brief->>'country' = 'us')::int`,
      locHouston: sql<number>`count(*) FILTER (WHERE location ILIKE '%Houston%')::int`,
      total: sql<number>`count(*)::int`,
      sample: sql<string>`(SELECT pay FROM jobs WHERE pay IS NOT NULL ORDER BY created_at DESC LIMIT 1)`,
    })
    .from(jobs);

  res.json({
    ok: true,
    before: Number(before),
    after: Number(after),
    updated: Number(before) - Number(after),
    debug,
  });
}

export async function adminPauseJobSource(
  req: Request,
  res: Response,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  const source = String(req.query.source ?? "").toLowerCase();
  const allowed = new Set(["adzuna", "voice", "link", "ats", "upload"]);
  if (!allowed.has(source)) {
    res.status(400).json({ error: "bad source" });
    return;
  }
  const keepHouston =
    String(req.query.keepHoustonConstruction ?? "") === "1";

  // brief.source uniquely tags adzuna rows. jobs.source is the enum.
  let filter = sql`structured_brief->>'source' = ${source}`;
  if (source !== "adzuna") {
    filter = sql`${jobs.source} = ${source as "voice" | "link" | "ats" | "upload"}`;
  }
  if (keepHouston) {
    filter = sql`${filter} AND ${jobs.location} NOT ILIKE '%Houston%'`;
  }

  const result = await db()
    .update(jobs)
    .set({ status: "paused", updatedAt: new Date() })
    .where(sql`${filter} AND ${jobs.status} = 'active'`)
    .returning({ id: jobs.id });

  console.log(
    `[admin/pause-source] source=${source} keepHouston=${keepHouston} paused=${result.length}`,
  );
  res.json({ ok: true, paused: result.length });
}

/**
 * GET /api/admin/inspect-session/:id — read-only trace bundle.
 * Returns session row + candidate row + profile_card + transcript turns.
 * Use for RCA on "my profile wasn't created" reports — gives concrete
 * evidence of what actually happened on the call.
 * Auth: INGEST_SECRET header. Not for end-user traffic.
 */
export async function adminInspectSession(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  const [s] = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!s) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  const [cand] = s.candidateId
    ? await db()
        .select()
        .from(candidates)
        .where(eq(candidates.id, s.candidateId))
        .limit(1)
    : [];
  const [card] = s.candidateId
    ? await db()
        .select()
        .from(profileCards)
        .where(eq(profileCards.candidateId, s.candidateId))
        .limit(1)
    : [];
  const turns = await db()
    .select()
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.ord));

  res.json({
    session: s,
    candidate: cand ?? null,
    profileCard: card ?? null,
    transcript: turns,
    summary: {
      turnCount: turns.length,
      hasCard: !!card,
      cardName: card?.name ?? null,
      cardYears: card?.yearsExperience ?? null,
    },
  });
}

/**
 * GET /api/admin/find-candidate?name=Lisa  | ?phone=+44...
 * Read-only candidate lookup for RCA. Returns the most recent match
 * + their latest session summary.
 */
export async function adminFindCandidate(
  req: Request,
  res: Response,
): Promise<void> {
  const expected = process.env.INGEST_SECRET;
  const got = req.header("x-ingest-secret") ?? "";
  if (!expected || got !== expected) {
    res.status(401).json({ error: "unauthorised" });
    return;
  }
  const name = String(req.query.name ?? "").trim().slice(0, 80);
  const phone = String(req.query.phone ?? "").trim().slice(0, 32);
  if (!name && !phone) {
    res.status(400).json({ error: "need ?name or ?phone" });
    return;
  }

  let rows: Array<{ id: string; phone: string; email: string | null; lastCallAt: Date | null }> = [];
  if (phone) {
    rows = await db()
      .select({
        id: candidates.id,
        phone: candidates.phone,
        email: candidates.email,
        lastCallAt: candidates.lastCallAt,
      })
      .from(candidates)
      .where(eq(candidates.phone, phone))
      .limit(5);
  } else if (name) {
    // Match candidate.profile_card.name (LIKE) — covers extraction
    // success; if profile_card is empty we fall back to nothing.
    const like = `%${name}%`;
    rows = await db()
      .select({
        id: candidates.id,
        phone: candidates.phone,
        email: candidates.email,
        lastCallAt: candidates.lastCallAt,
      })
      .from(candidates)
      .innerJoin(profileCards, eq(profileCards.candidateId, candidates.id))
      .where(sql`${profileCards.name} ILIKE ${like}`)
      .limit(10);
  }

  const out = [];
  for (const r of rows) {
    const [card] = await db()
      .select()
      .from(profileCards)
      .where(eq(profileCards.candidateId, r.id))
      .limit(1);
    const recentSessions = await db()
      .select({
        id: sessions.id,
        kind: sessions.kind,
        status: sessions.status,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
      })
      .from(sessions)
      .where(eq(sessions.candidateId, r.id))
      .orderBy(desc(sessions.startedAt))
      .limit(5);
    out.push({ candidate: r, profileCard: card ?? null, recentSessions });
  }
  res.json({ matched: out.length, results: out });
}
