/**
 * Candidate-facing match scoring. LLM-computed 0-100 per pillar:
 *   - experience   (years vs job seniority)
 *   - skills       (credentials, projects, trade fit)
 *   - industry     (vertical / domain overlap)
 * Plus a one-line rationale. Stored on the matches row so the next
 * view is free.
 *
 * Auth: Firebase Bearer + candidate owns the profile being scored.
 * Cost: one Claude Sonnet call per (candidate, job) pair on first
 * request; cached after.
 */

import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { getAuth } from "firebase-admin/auth";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  candidates,
  jobs,
  matches,
  profileCards,
} from "@gig-grab/db";
import { and, eq, sql } from "drizzle-orm";

// Self-bootstrap: matches.score_breakdown is new — idempotent ALTER
// on cold start so prod doesn't need a separate migration.
let matchSchemaEnsured = false;
async function ensureMatchSchema(): Promise<void> {
  if (matchSchemaEnsured) return;
  try {
    await db().execute(sql`
      ALTER TABLE matches
        ADD COLUMN IF NOT EXISTS score_breakdown JSONB
    `);
    matchSchemaEnsured = true;
  } catch (err) {
    console.warn("[matches/migrate] schema ensure failed", err);
  }
}

const SCORE_SYSTEM = `You are a senior recruiter scoring how well a candidate fits a job.

Return a single JSON object exactly matching this shape (NO prose, NO code fences):
{
  "overall": 0-100,           // single headline score
  "experience": 0-100,        // years/seniority match
  "skills": 0-100,            // credentials, certs, hands-on skills match
  "industry": 0-100,          // domain/vertical overlap
  "rationale": "string"       // ONE short sentence, 12-20 words, concrete
}

Scoring rules:
- 90+ only when match is unambiguous (right trade, right years, key credentials).
- 70-89 strong fit with one minor gap.
- 50-69 partial fit — wrong years or missing some skills.
- 30-49 adjacent — same broad area but real gaps.
- 0-29 wrong area entirely.
Never inflate. Never use empty praise like "great fit". Cite what matched.`;

type ScoreBreakdown = {
  overall: number;
  experience: number;
  skills: number;
  industry: number;
  rationale: string;
};

async function decodeBearer(req: Request): Promise<string | null> {
  const authz = (req.headers.authorization ?? "") as string;
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) return null;
  try {
    const d = await getAuth().verifyIdToken(tok);
    return d.uid;
  } catch {
    return null;
  }
}

function clamp100(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * POST /api/account/jobs/:jobId/score — returns the 3-pillar match
 * for the signed-in candidate. Cached to matches.score_breakdown after
 * first compute; subsequent reads are free.
 *
 * Body (optional): { recompute: true } forces a fresh LLM call even
 * if cached.
 */
export async function accountJobScore(
  req: Request,
  res: Response,
  jobId: string,
): Promise<void> {
  await ensureMatchSchema();
  const uid = await decodeBearer(req);
  if (!uid) {
    res.status(401).json({ error: "unauthenticated" });
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

  const [card] = await db()
    .select()
    .from(profileCards)
    .where(eq(profileCards.candidateId, me.id))
    .limit(1);
  if (!card) {
    res.status(409).json({ error: "no profile yet" });
    return;
  }

  const [job] = await db()
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job || job.status !== "active") {
    res.status(404).json({ error: "job not available" });
    return;
  }

  // Cache hit
  const recompute = Boolean((req.body ?? {}).recompute);
  const [cached] = await db()
    .select({
      breakdown: matches.scoreBreakdown,
      whyRanked: matches.whyRanked,
      score: matches.score,
    })
    .from(matches)
    .where(
      and(eq(matches.candidateId, me.id), eq(matches.jobId, jobId)),
    )
    .limit(1);
  if (!recompute && cached?.breakdown?.experience !== undefined) {
    res.json({
      overall: clamp100(Number(cached.score) * 100),
      experience: clamp100(cached.breakdown.experience),
      skills: clamp100(cached.breakdown.skills),
      industry: clamp100(cached.breakdown.industry),
      rationale: cached.breakdown.rationale ?? cached.whyRanked ?? "",
      cached: true,
    });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "scorer unavailable" });
    return;
  }

  const candidateBlock = [
    `Trade: ${card.title}`,
    card.yearsExperience ? `Years experience: ${card.yearsExperience}` : null,
    card.location ? `Location: ${card.location}` : null,
    card.summary ? `Summary: ${card.summary}` : null,
    card.education ? `Education: ${card.education}` : null,
    card.languagesSpoken?.length
      ? `Languages: ${card.languagesSpoken.join(", ")}`
      : null,
    card.workAuth ? `Right to work: ${card.workAuth}` : null,
    card.ticketsAndCards?.length
      ? `Credentials: ${card.ticketsAndCards.join(", ")}`
      : null,
    card.recentProjects?.length
      ? `Recent: ${card.recentProjects
          .slice(0, 3)
          .map((p) => [p.role, p.company].filter(Boolean).join(" at "))
          .join(" | ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const brief = (job.structuredBrief ?? {}) as Record<string, unknown>;
  const jobBlock = [
    `Title: ${job.title}`,
    `Location: ${job.location}`,
    job.pay ? `Pay: ${job.pay}` : null,
    job.shiftPattern ? `Shift: ${job.shiftPattern}` : null,
    job.mustHaves?.length ? `Must-haves: ${job.mustHaves.join(", ")}` : null,
    job.dealBreakers?.length
      ? `Deal-breakers: ${job.dealBreakers.join(", ")}`
      : null,
    typeof brief.projectScope === "string"
      ? `Scope: ${brief.projectScope}`
      : null,
    Array.isArray(brief.whatYoullNeed)
      ? `What you'll need: ${(brief.whatYoullNeed as string[]).join(", ")}`
      : null,
    typeof brief.description === "string"
      ? `About: ${(brief.description as string).slice(0, 800)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    system: SCORE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Candidate:\n${candidateBlock}\n\nJob:\n${jobBlock}`,
      },
    ],
  });

  let payload = "";
  for (const b of resp.content) if (b.type === "text") payload += b.text;
  const m = payload.match(/\{[\s\S]*\}/);
  if (!m) {
    console.warn("[match-score] no JSON in response", payload.slice(0, 200));
    res.status(502).json({ error: "scorer returned no JSON" });
    return;
  }
  let parsed: Partial<ScoreBreakdown>;
  try {
    parsed = JSON.parse(m[0]) as Partial<ScoreBreakdown>;
  } catch (err) {
    console.warn("[match-score] JSON parse failed", err);
    res.status(502).json({ error: "scorer returned invalid JSON" });
    return;
  }

  const out: ScoreBreakdown = {
    overall: clamp100(parsed.overall),
    experience: clamp100(parsed.experience),
    skills: clamp100(parsed.skills),
    industry: clamp100(parsed.industry),
    rationale: String(parsed.rationale ?? "").slice(0, 400),
  };

  // Cache to matches row. Insert if no row exists; otherwise update
  // without downgrading an existing applied/screened/shortlisted
  // status.
  await db()
    .insert(matches)
    .values({
      candidateId: me.id,
      jobId,
      score: (out.overall / 100).toFixed(3),
      whyRanked: out.rationale,
      scoreBreakdown: {
        experience: out.experience,
        skills: out.skills,
        industry: out.industry,
        rationale: out.rationale,
      },
      status: "suggested",
    })
    .onConflictDoUpdate({
      target: [matches.candidateId, matches.jobId],
      set: {
        score: (out.overall / 100).toFixed(3),
        whyRanked: out.rationale,
        scoreBreakdown: {
          experience: out.experience,
          skills: out.skills,
          industry: out.industry,
          rationale: out.rationale,
        },
        updatedAt: new Date(),
      },
    });

  res.json({ ...out, cached: false });
}
