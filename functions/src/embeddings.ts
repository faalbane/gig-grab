/**
 * Embedding generation for candidate profiles and jobs.
 *
 * Strategy: OpenAI `text-embedding-3-small` (1536 dims) matches the
 * pgvector columns already in schema (`candidates.profile_embedding`
 * and `jobs.embedding`, both with HNSW cosine indexes). We render
 * profile_cards and job rows to compact text, embed them, and write
 * the vector back to the row. Top-K candidate search for a job is then
 * a single pgvector cosine query — O(log N) with HNSW even at 100k+ rows.
 *
 * Cost: ~$0.02 per 1M tokens. A typical profile/job renders to ~200
 * tokens; re-embedding every profile_card on edit costs effectively
 * nothing.
 */

import { db, candidates, profileCards, jobs } from "@gig-grab/db";
import { eq, sql } from "drizzle-orm";

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 1536;

export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn("[embed] OPENAI_API_KEY not set — skipping embedding");
    return null;
  }
  const cleaned = text.trim();
  if (!cleaned) return null;
  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: cleaned.slice(0, 8000),
      }),
    });
    if (!res.ok) {
      console.error("[embed] openai non-2xx", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    const vec = json.data?.[0]?.embedding;
    if (!vec || vec.length !== EMBED_DIM) {
      console.error(
        "[embed] unexpected response shape; len=",
        vec?.length ?? "(none)",
      );
      return null;
    }
    return vec;
  } catch (err) {
    console.error("[embed] fetch failed", err);
    return null;
  }
}

/**
 * Render a profile_card row to the text we embed. Trades off being
 * dense (more signal) vs. concise (cheap, faster).
 */
function renderProfileText(card: {
  name: string;
  title: string | null;
  yearsExperience: number | null;
  location: string | null;
  summary: string | null;
  ticketsAndCards: string[] | null;
  recentProjects: Array<{
    role: string;
    company: string;
    period: string;
    description?: string;
  }> | null;
}): string {
  const parts: string[] = [];
  if (card.title) parts.push(`Trade: ${card.title}`);
  if (card.yearsExperience && card.yearsExperience > 0) {
    parts.push(`Experience: ${card.yearsExperience} years`);
  }
  if (card.location) parts.push(`Location: ${card.location}`);
  if (card.summary) parts.push(`Summary: ${card.summary}`);
  if (card.ticketsAndCards?.length) {
    parts.push(`Credentials: ${card.ticketsAndCards.join(", ")}`);
  }
  if (card.recentProjects?.length) {
    const proj = card.recentProjects
      .slice(0, 3)
      .map((p) => {
        const head = [p.role, p.company].filter(Boolean).join(" at ");
        return p.description ? `${head} — ${p.description}` : head;
      })
      .filter(Boolean)
      .join(" | ");
    if (proj) parts.push(`Recent: ${proj}`);
  }
  return parts.join(". ");
}

export async function embedCandidate(candidateId: string): Promise<void> {
  const [card] = await db()
    .select()
    .from(profileCards)
    .where(eq(profileCards.candidateId, candidateId))
    .limit(1);
  if (!card) return;
  const text = renderProfileText(card);
  if (!text) return;
  const vec = await embedText(text);
  if (!vec) return;
  await db()
    .update(candidates)
    .set({ profileEmbedding: vec })
    .where(eq(candidates.id, candidateId));
}

function renderJobText(job: {
  title: string;
  location: string;
  pay: string | null;
  shiftPattern: string | null;
  mustHaves: string[] | null;
  dealBreakers: string[] | null;
  structuredBrief: unknown;
}): string {
  const parts: string[] = [`Role: ${job.title}`, `Location: ${job.location}`];
  if (job.pay) parts.push(`Pay: ${job.pay}`);
  if (job.shiftPattern) parts.push(`Shift: ${job.shiftPattern}`);
  if (job.mustHaves?.length) {
    parts.push(`Must-haves: ${job.mustHaves.join(", ")}`);
  }
  if (job.dealBreakers?.length) {
    parts.push(`Deal-breakers: ${job.dealBreakers.join(", ")}`);
  }
  const brief = (job.structuredBrief as Record<string, unknown>) ?? {};
  if (typeof brief.projectScope === "string") {
    parts.push(`Scope: ${brief.projectScope}`);
  }
  if (Array.isArray(brief.whatYoullNeed)) {
    parts.push(`Needs: ${(brief.whatYoullNeed as string[]).join(", ")}`);
  }
  if (typeof brief.description === "string") {
    parts.push(`About: ${brief.description}`);
  }
  return parts.join(". ");
}

export async function embedJob(jobId: string): Promise<void> {
  const [job] = await db()
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) return;
  const text = renderJobText(job);
  if (!text) return;
  const vec = await embedText(text);
  if (!vec) return;
  await db().update(jobs).set({ embedding: vec }).where(eq(jobs.id, jobId));
}

/**
 * Pgvector top-K cosine similarity. Returns candidate IDs ranked by
 * proximity to the job's embedding. Score is `1 - cosine_distance`
 * (higher = closer), surfaced as 0-100 for the UI.
 */
export async function topCandidatesForJob(
  jobId: string,
  k = 20,
): Promise<Array<{ candidateId: string; score: number }>> {
  const result = await db().execute(sql`
    WITH target AS (
      SELECT embedding FROM jobs WHERE id = ${jobId} AND embedding IS NOT NULL
    )
    SELECT
      c.id,
      1 - (c.profile_embedding <=> (SELECT embedding FROM target)) AS score
    FROM candidates c, target
    WHERE c.profile_embedding IS NOT NULL
    ORDER BY c.profile_embedding <=> (SELECT embedding FROM target)
    LIMIT ${k}
  `);
  const rows = (result as unknown as { rows: Array<{ id: string; score: string | number }> }).rows ?? [];
  return rows.map((r) => ({
    candidateId: r.id,
    score: Math.round(Number(r.score) * 100),
  }));
}
