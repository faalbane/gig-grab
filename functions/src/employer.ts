/**
 * Employer-side endpoints. Mirrors the candidate `account` surface for
 * users on the hiring side of the platform.
 *
 * Identity:
 *   `employers.firebase_uid` claims the row. Resolution order:
 *     (a) firebase_uid == auth.uid  (steady state)
 *     (b) email == auth.email && auth.email_verified  → claim if unclaimed
 *     (c) 404 — must call hotline first OR be invited later.
 *
 *   No phone column on employers — the post-call extractor stubs a
 *   `pending-<uuid>@gig-grab.local` email if the caller didn't share one,
 *   which means the web-side claim flow has nothing to match against
 *   until the caller gives a real email. That's intentional for pilot
 *   scope; alternative is the candidates-side phone-merge pattern.
 *
 * Matching:
 *   `topCandidatesForJob` uses pgvector cosine on
 *   `candidates.profile_embedding`. The endpoint then optionally calls
 *   Claude Sonnet to rerank the top-K and produce a one-line rationale
 *   per candidate, cached in `matches.whyRanked`. The rerank is the
 *   expensive part — gated by query param so the list page is fast and
 *   the drill-down does the LLM call only on click.
 */

import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { getAuth } from "firebase-admin/auth";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  employers,
  jobs,
  profileCards,
  matches,
} from "@gig-grab/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { topCandidatesForJob } from "./embeddings";

type AuthCtx = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
};

async function decodeBearer(req: Request): Promise<AuthCtx | null> {
  const authz = (req.headers.authorization ?? "") as string;
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) return null;
  try {
    const decoded = await getAuth().verifyIdToken(tok);
    return {
      uid: decoded.uid,
      email: (decoded.email ?? null) as string | null,
      emailVerified: Boolean(decoded.email_verified),
    };
  } catch {
    return null;
  }
}

async function resolveEmployer(auth: AuthCtx) {
  const [byUid] = await db()
    .select()
    .from(employers)
    .where(eq(employers.firebaseUid, auth.uid))
    .limit(1);
  if (byUid) return byUid;

  if (auth.emailVerified && auth.email) {
    const [byEmail] = await db()
      .select()
      .from(employers)
      .where(eq(employers.email, auth.email.toLowerCase()))
      .limit(1);
    if (byEmail) {
      if (byEmail.firebaseUid && byEmail.firebaseUid !== auth.uid) return null;
      const [claimed] = await db()
        .update(employers)
        .set({ firebaseUid: auth.uid })
        .where(eq(employers.id, byEmail.id))
        .returning();
      return claimed;
    }
  }

  return null;
}

/** GET /api/account/employer/me — returns the signed-in employer + their jobs. */
export async function employerMe(req: Request, res: Response): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const emp = await resolveEmployer(auth);
  if (!emp) {
    // Not an employer yet — UI can show the "call our hotline to post a
    // job" empty state.
    res.json({ employer: null, jobs: [] });
    return;
  }

  const jobRows = await db()
    .select({
      id: jobs.id,
      title: jobs.title,
      location: jobs.location,
      pay: jobs.pay,
      shiftPattern: jobs.shiftPattern,
      status: jobs.status,
      requiredCount: jobs.requiredCount,
      createdAt: jobs.createdAt,
      mustHaves: jobs.mustHaves,
    })
    .from(jobs)
    .where(eq(jobs.employerId, emp.id))
    .orderBy(sql`${jobs.createdAt} desc`);

  // Cheap per-job match-count: count candidates whose existing
  // `matches` row points at this job. Not full top-K — that's the
  // drill-down endpoint.
  const counts = new Map<string, number>();
  if (jobRows.length > 0) {
    const countRows = await db()
      .select({
        jobId: matches.jobId,
        n: sql<number>`count(*)::int`,
      })
      .from(matches)
      .where(
        inArray(
          matches.jobId,
          jobRows.map((j) => j.id),
        ),
      )
      .groupBy(matches.jobId);
    for (const r of countRows) counts.set(r.jobId, Number(r.n));
  }

  res.json({
    employer: {
      id: emp.id,
      email: emp.email,
      company: emp.company,
    },
    jobs: jobRows.map((j) => ({
      ...j,
      matchCount: counts.get(j.id) ?? 0,
    })),
  });
}

/**
 * GET /api/account/employer/jobs/:id/matches — top-K candidates by
 * embedding similarity. If `?rerank=1` is passed and ANTHROPIC_API_KEY
 * is set, the top-K is re-ranked by Claude with a one-line rationale.
 * Results are cached into `matches` so the next page-load is cheap.
 */
export async function employerJobMatches(
  req: Request,
  res: Response,
  jobId: string,
): Promise<void> {
  const auth = await decodeBearer(req);
  if (!auth) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const emp = await resolveEmployer(auth);
  if (!emp) {
    res.status(403).json({ error: "not an employer" });
    return;
  }

  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.employerId, emp.id)))
    .limit(1);
  if (!job) {
    res.status(404).json({ error: "not your job" });
    return;
  }

  if (!job.embedding) {
    // Embedding not yet generated (likely OPENAI_API_KEY was missing at
    // ingest time, or this is a row from before the embed wiring landed).
    res.json({ job: { id: job.id, title: job.title }, candidates: [] });
    return;
  }

  const top = await topCandidatesForJob(job.id, 20);
  if (top.length === 0) {
    res.json({ job: { id: job.id, title: job.title }, candidates: [] });
    return;
  }

  // Hydrate candidate display + cached rationale (if any).
  const candidateIds = top.map((t) => t.candidateId);
  const profiles = await db()
    .select({
      candidateId: profileCards.candidateId,
      name: profileCards.name,
      title: profileCards.title,
      yearsExperience: profileCards.yearsExperience,
      location: profileCards.location,
      summary: profileCards.summary,
      ticketsAndCards: profileCards.ticketsAndCards,
    })
    .from(profileCards)
    .where(inArray(profileCards.candidateId, candidateIds));
  const profileMap = new Map(profiles.map((p) => [p.candidateId, p]));

  const cached = await db()
    .select({
      candidateId: matches.candidateId,
      status: matches.status,
      whyRanked: matches.whyRanked,
    })
    .from(matches)
    .where(
      and(
        eq(matches.jobId, job.id),
        inArray(matches.candidateId, candidateIds),
      ),
    );
  const cacheMap = new Map(cached.map((m) => [m.candidateId, m]));

  let hydrated = top.map((t) => {
    const p = profileMap.get(t.candidateId);
    const m = cacheMap.get(t.candidateId);
    return {
      candidateId: t.candidateId,
      score: t.score,
      name: p?.name ?? null,
      title: p?.title ?? null,
      yearsExperience: p?.yearsExperience ?? null,
      location: p?.location ?? null,
      summary: p?.summary ?? null,
      ticketsAndCards: p?.ticketsAndCards ?? [],
      status: m?.status ?? null,
      rationale: m?.whyRanked ?? null,
    };
  });

  // Optional LLM rerank with rationale. Skipped on initial list view to
  // keep that page cheap. Triggered when the employer clicks into a job.
  const wantRerank = req.query.rerank === "1";
  if (wantRerank && process.env.ANTHROPIC_API_KEY) {
    try {
      const reranked = await rerankWithRationale(
        {
          title: job.title,
          location: job.location,
          pay: job.pay ?? "",
          mustHaves: job.mustHaves ?? [],
        },
        hydrated.slice(0, 10),
      );
      hydrated = reranked;

      // Cache the rationale + a soft `suggested` status into matches so
      // the next view doesn't re-pay for LLM. Keep existing higher
      // statuses (applied/screened/shortlisted) — never downgrade.
      for (const c of reranked) {
        if (!c.rationale) continue;
        await db()
          .insert(matches)
          .values({
            candidateId: c.candidateId,
            jobId: job.id,
            score: (c.score / 100).toFixed(3),
            whyRanked: c.rationale,
            status: "suggested",
          })
          .onConflictDoUpdate({
            target: [matches.candidateId, matches.jobId],
            set: {
              whyRanked: c.rationale,
              score: (c.score / 100).toFixed(3),
              updatedAt: new Date(),
            },
          });
      }
    } catch (err) {
      console.error("[employer/matches] rerank failed", err);
    }
  }

  res.json({
    job: {
      id: job.id,
      title: job.title,
      location: job.location,
      pay: job.pay,
    },
    candidates: hydrated,
  });
}

type MatchStatus =
  | "suggested"
  | "applied"
  | "screened"
  | "shortlisted"
  | "rejected"
  | null;

type RerankCandidate = {
  candidateId: string;
  score: number;
  name: string | null;
  title: string | null;
  yearsExperience: number | null;
  location: string | null;
  summary: string | null;
  ticketsAndCards: string[];
  status: MatchStatus;
  rationale: string | null;
};

async function rerankWithRationale(
  job: {
    title: string;
    location: string;
    pay: string;
    mustHaves: string[];
  },
  candidatesIn: RerankCandidate[],
): Promise<RerankCandidate[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // Compact LLM payload — only the fields that drive the decision.
  const cands = candidatesIn.map((c, i) => ({
    idx: i,
    candidateId: c.candidateId,
    trade: c.title ?? "(unknown)",
    years: c.yearsExperience ?? 0,
    location: c.location ?? "",
    summary: (c.summary ?? "").slice(0, 400),
    credentials: c.ticketsAndCards.slice(0, 10),
  }));

  const system = `You are a senior recruiter. Rank candidates for a job by likely fit.
- Heavily weight: trade match, years experience, required credentials.
- Moderate: location proximity, pay alignment (you don't know candidate pay, infer from seniority).
- Score 0-100 (100 = unambiguous fit).
- Rationale: one sentence, ≤25 words, concrete (cite their trade, years, key credential). NO "great candidate", "strong fit", or other vague praise.
- Return JSON only: { ranked: [{ candidateId, score, rationale }, ...] } sorted descending by score.`;

  const userMsg = `Job:
Role: ${job.title}
Location: ${job.location}
Pay: ${job.pay || "not stated"}
Must-haves: ${job.mustHaves.length ? job.mustHaves.join(", ") : "(none)"}

Candidates (top-${cands.length} by embedding similarity):
${cands.map((c) => `[${c.idx}] id=${c.candidateId} trade=${c.trade} years=${c.years} loc=${c.location} creds=${c.credentials.join("/")||"-"} summary="${c.summary}"`).join("\n")}

Return JSON only.`;

  const resp = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  let payload = "";
  for (const block of resp.content) {
    if (block.type === "text") payload += block.text;
  }
  const match = payload.match(/\{[\s\S]*\}/);
  if (!match) {
    console.warn("[employer/rerank] no JSON in response");
    return candidatesIn;
  }
  type RankedItem = { candidateId: string; score: number; rationale: string };
  type RerankPayload = { ranked: RankedItem[] };
  let parsed: RerankPayload;
  try {
    parsed = JSON.parse(match[0]) as RerankPayload;
  } catch (err) {
    console.warn("[employer/rerank] JSON parse failed", err);
    return candidatesIn;
  }
  const byId = new Map(candidatesIn.map((c) => [c.candidateId, c]));
  const out: RerankCandidate[] = [];
  for (const r of parsed.ranked ?? []) {
    const c = byId.get(r.candidateId);
    if (!c) continue;
    out.push({
      ...c,
      score: typeof r.score === "number" ? Math.round(r.score) : c.score,
      rationale: r.rationale ?? null,
    });
  }
  // Append any candidates the LLM dropped so the list isn't truncated.
  for (const c of candidatesIn) {
    if (!out.find((x) => x.candidateId === c.candidateId)) out.push(c);
  }
  return out;
}
