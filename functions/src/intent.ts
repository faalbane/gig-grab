import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  candidates,
  sessions,
  transcriptTurns,
  type CandidateMatchSignals,
} from "@gig-grab/db";
import { eq, asc } from "drizzle-orm";

const CLASSIFY_PROMPT = `You read the opening turns of a phone call to GigGrab's hotline and decide whether the caller is a WORKER (looking for work) or an EMPLOYER (hiring people). Only those two labels. If genuinely unclear, default to "worker" (the common case). Return ONLY the JSON tool call — no prose.`;

const CLASSIFY_TOOL = {
  name: "classify_audience",
  description: "Pick the caller's intent.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["audience", "confidence"],
    properties: {
      audience: {
        type: "string",
        enum: ["worker", "employer"],
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
    },
  },
};

/** Classify an inbound hotline call as worker vs employer based on the
 * first few transcript turns. Uses Claude Haiku (cheap, fast). Falls
 * back to "worker" on any error so we don't strand the user. */
export async function classifyAudience(
  sessionId: string,
): Promise<"worker" | "employer"> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[intent] ANTHROPIC_API_KEY not set — defaulting to worker");
    return "worker";
  }

  const turns = await db()
    .select()
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.ord))
    .limit(6);
  if (turns.length === 0) return "worker";

  const transcriptText = turns
    .map((t) => `${t.speaker === "ai" ? "AI" : "Caller"}: ${t.text}`)
    .join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: CLASSIFY_PROMPT,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_audience" },
      messages: [
        {
          role: "user",
          content: `<transcript>\n${transcriptText}\n</transcript>\n\nClassify.`,
        },
      ],
    });
    const toolUse = message.content.find(
      (block) => block.type === "tool_use" && block.name === "classify_audience",
    );
    if (toolUse && toolUse.type === "tool_use") {
      const input = toolUse.input as {
        audience: "worker" | "employer";
        confidence: string;
      };
      console.log(
        `[intent] session=${sessionId} classified=${input.audience} confidence=${input.confidence}`,
      );
      return input.audience;
    }
  } catch (err) {
    console.error("[intent] classifier failed, defaulting to worker", err);
  }
  return "worker";
}

/** Persist the classified audience on candidates.match_signals so the
 * next inbound call from this phone skips the intent question. */
export async function persistAudience(
  candidateId: string,
  audience: "worker" | "employer",
): Promise<void> {
  const [row] = await db()
    .select({ matchSignals: candidates.matchSignals })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);
  const next: CandidateMatchSignals = {
    ...(row?.matchSignals ?? {}),
    audience,
  };
  await db()
    .update(candidates)
    .set({ matchSignals: next })
    .where(eq(candidates.id, candidateId));
}

/** If the session was opened with kind=candidate_intake but the
 * classifier says employer, flip session.kind so post-call extraction
 * and historical reporting reflect reality. */
export async function maybeFlipSessionKind(
  sessionId: string,
  audience: "worker" | "employer",
): Promise<void> {
  // Bidirectional. A cached employer who calls as a worker this time
  // (or vice versa) must be allowed to flip — otherwise the post-call
  // dispatcher routes their transcript to the wrong extractor.
  const targetKind =
    audience === "employer" ? "employer_intake" : "candidate_intake";
  await db()
    .update(sessions)
    .set({ kind: targetKind })
    .where(eq(sessions.id, sessionId));
}
