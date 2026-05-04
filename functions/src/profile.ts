import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  candidates,
  sessions,
  transcriptTurns,
  profileCards,
  type ProfileProject,
} from "@gig-grab/db";
import { eq, asc } from "drizzle-orm";

const PROFILE_EXTRACTION_PROMPT = `You are an expert at distilling a candidate intake call into a structured profile that will appear on a recruiter-facing CV. Read the transcript and produce ONE JSON object matching the schema. Be conservative — leave fields empty when the candidate didn't say it. Match the candidate's tone in the summary.`;

const PROFILE_TOOL = {
  name: "save_profile",
  description: "Persist the structured profile extracted from the call.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["name", "title", "yearsExperience", "location", "summary"],
    properties: {
      name: { type: "string", description: "First name only is fine." },
      title: {
        type: "string",
        description:
          "Short noun phrase: 'site carpenter', 'A&E nurse', 'sous chef', 'product designer'.",
      },
      yearsExperience: { type: "number", minimum: 0 },
      location: { type: "string", description: "City or region the candidate is based in." },
      summary: {
        type: "string",
        description:
          "1-2 sentence neutral profile summary in third person. Lead with trade + years + location.",
      },
      ticketsAndCards: {
        type: "array",
        items: { type: "string" },
        description: "Verbatim list of certs/tickets — 'CSCS Gold', 'IPAF 3a/3b', 'NMC PIN', etc.",
      },
      recentProjects: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["role", "company", "period"],
          properties: {
            role: { type: "string" },
            company: { type: "string" },
            period: { type: "string", description: "e.g. '2024-2025' or '6 months in 2025'." },
            description: { type: "string" },
          },
        },
      },
    },
  },
};

/** Get the API endpoint that returns transcript + profile for a session. */
export async function sessionProfileGet(
  req: Request,
  res: Response,
  sessionId: string,
): Promise<void> {
  // Require the HMAC token issued at intake time. Without this, anyone with
  // the sessionId UUID could read the candidate's profile + transcript.
  const token =
    (req.query.token as string | undefined) ??
    ((req.header("x-session-token") ?? "") as string);
  const { verifySessionToken } = await import("./security");
  if (!verifySessionToken(sessionId, token)) {
    res.status(401).json({ error: "invalid or missing session token" });
    return;
  }

  const [session] = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  if (!session.candidateId) {
    res.status(400).json({ error: "session has no candidate" });
    return;
  }

  const [candidate] = await db()
    .select({
      id: candidates.id,
      phone: candidates.phone,
      language: candidates.language,
      email: candidates.email,
    })
    .from(candidates)
    .where(eq(candidates.id, session.candidateId))
    .limit(1);

  const turns = await db()
    .select()
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.ord));

  const [card] = await db()
    .select()
    .from(profileCards)
    .where(eq(profileCards.candidateId, session.candidateId))
    .limit(1);

  res.json({
    candidate: {
      id: candidate?.id,
      phone: candidate?.phone,
      language: candidate?.language,
      email: candidate?.email ?? undefined,
    },
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    },
    transcript: turns.map((t) => ({
      id: t.id,
      sessionId: t.sessionId,
      ord: t.ord,
      speaker: t.speaker,
      text: t.text,
      msOffset: t.msOffset,
      timestamp: t.createdAt,
    })),
    profile: card
      ? {
          candidateId: card.candidateId,
          name: card.name,
          title: card.title,
          yearsExperience: card.yearsExperience,
          location: card.location,
          summary: card.summary,
          ticketsAndCards: card.ticketsAndCards ?? [],
          recentProjects: card.recentProjects ?? [],
          updatedAt: card.updatedAt,
        }
      : null,
  });
}

/** Run Claude over the transcript, write profile_cards row. Idempotent. */
export async function extractProfile(sessionId: string): Promise<void> {
  const [session] = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session?.candidateId) return;

  // Idempotency guard — Twilio retries the status callback on transient
  // failures, and we don't want to pay for a Claude call per retry. If a
  // profile_card already exists for this candidate and was updated AFTER
  // the session ended, we've already extracted.
  if (session.endedAt) {
    const [existing] = await db()
      .select({ updatedAt: profileCards.updatedAt })
      .from(profileCards)
      .where(eq(profileCards.candidateId, session.candidateId))
      .limit(1);
    if (existing && existing.updatedAt >= session.endedAt) {
      console.log(`[extract] already extracted for ${sessionId}, skipping`);
      return;
    }
  }

  const turns = await db()
    .select()
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.ord));
  if (turns.length < 2) {
    console.warn(
      `[extract] session ${sessionId} has ${turns.length} turns — need at least 2`,
    );
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[extract] ANTHROPIC_API_KEY not set — skipping");
    return;
  }
  const client = new Anthropic({ apiKey });

  const transcriptText = turns
    .map((t) => `${t.speaker === "ai" ? "AI" : "Candidate"}: ${t.text}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: PROFILE_EXTRACTION_PROMPT,
    tools: [PROFILE_TOOL],
    tool_choice: { type: "tool", name: "save_profile" },
    messages: [
      {
        role: "user",
        content: `<transcript>\n${transcriptText}\n</transcript>\n\nExtract the profile.`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block) => block.type === "tool_use" && block.name === "save_profile",
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    console.warn(`[extract] Claude did not call save_profile for ${sessionId}`);
    return;
  }
  const input = toolUse.input as {
    name: string;
    title: string;
    yearsExperience: number;
    location: string;
    summary: string;
    ticketsAndCards?: string[];
    recentProjects?: ProfileProject[];
  };

  await db()
    .insert(profileCards)
    .values({
      candidateId: session.candidateId,
      name: input.name,
      title: input.title,
      yearsExperience: input.yearsExperience,
      location: input.location,
      summary: input.summary,
      ticketsAndCards: input.ticketsAndCards ?? [],
      recentProjects: input.recentProjects ?? [],
    })
    .onConflictDoUpdate({
      target: profileCards.candidateId,
      set: {
        name: input.name,
        title: input.title,
        yearsExperience: input.yearsExperience,
        location: input.location,
        summary: input.summary,
        ticketsAndCards: input.ticketsAndCards ?? [],
        recentProjects: input.recentProjects ?? [],
        updatedAt: new Date(),
      },
    });
  console.log(`[extract] saved profile for ${sessionId}`);
}
