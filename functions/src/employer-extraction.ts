import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import {
  db,
  employers,
  jobs,
  sessions,
  transcriptTurns,
  type NewJob,
} from "@gig-grab/db";
import { eq, asc } from "drizzle-orm";

const SYSTEM = `You are an expert at distilling an employer intake call into a structured job posting + employer record. Read the transcript and call save_job ONCE. Be conservative — leave fields null when the employer didn't say them. Never fabricate. Match the employer's tone in the structuredBrief copy (concise, no marketing fluff).`;

const SAVE_JOB_TOOL = {
  name: "save_job",
  description: "Persist the structured job + employer record extracted from the call.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["callerName", "company", "title", "location"],
    properties: {
      callerName: { type: "string" },
      callerEmail: { type: ["string", "null"] },
      company: { type: "string" },
      title: { type: "string" },
      location: { type: "string" },
      shiftPattern: { type: ["string", "null"] },
      requiredCount: { type: ["integer", "null"], minimum: 1 },
      startDate: { type: ["string", "null"] },
      duration: { type: ["string", "null"] },
      payLow: { type: ["number", "null"] },
      payHigh: { type: ["number", "null"] },
      payCurrency: {
        type: ["string", "null"],
        enum: ["GBP", "USD", "EUR", "AUD", "CAD", null],
      },
      payBasis: {
        type: ["string", "null"],
        enum: ["hour", "day", "week", "month", "year", null],
      },
      mustHaves: { type: "array", items: { type: "string" } },
      dealBreakers: { type: "array", items: { type: "string" } },
      interviewPreference: {
        type: ["string", "null"],
        enum: ["ai_screening", "with_me", "ai_then_with_me", null],
      },
      calendarProvider: {
        type: ["string", "null"],
        enum: ["google", "microsoft", "other", null],
      },
      structuredBrief: {
        type: "object",
        additionalProperties: false,
        properties: {
          projectScope: { type: "string" },
          whatYoullNeed: { type: "array", items: { type: "string" } },
          rateAndTiming: { type: "string" },
        },
      },
    },
  },
};

type SaveJobInput = {
  callerName: string;
  callerEmail?: string | null;
  company: string;
  title: string;
  location: string;
  shiftPattern?: string | null;
  requiredCount?: number | null;
  startDate?: string | null;
  duration?: string | null;
  payLow?: number | null;
  payHigh?: number | null;
  payCurrency?: string | null;
  payBasis?: string | null;
  mustHaves?: string[];
  dealBreakers?: string[];
  interviewPreference?: string | null;
  calendarProvider?: "google" | "microsoft" | "other" | null;
  structuredBrief?: {
    projectScope?: string;
    whatYoullNeed?: string[];
    rateAndTiming?: string;
  };
};

function formatPay(input: SaveJobInput): string | null {
  const { payLow, payHigh, payCurrency, payBasis } = input;
  if (payLow == null && payHigh == null) return null;
  const sym =
    payCurrency === "USD" ? "$" :
    payCurrency === "EUR" ? "€" :
    payCurrency === "GBP" ? "£" :
    payCurrency ? `${payCurrency} ` : "";
  const range =
    payHigh && payLow && payHigh !== payLow
      ? `${sym}${payLow.toLocaleString()}–${sym}${payHigh.toLocaleString()}`
      : `${sym}${(payLow ?? payHigh)!.toLocaleString()}`;
  const basis = payBasis ? `/${payBasis}` : "";
  return `${range}${basis}`;
}

/**
 * Run Claude over the employer intake transcript, then write employer + job
 * rows. Idempotent — re-runs update the existing job row by session linkage.
 */
export async function extractEmployerJob(sessionId: string): Promise<void> {
  const [session] = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) return;
  if (session.kind !== "employer_intake") {
    console.log(`[extract:job] session ${sessionId} is ${session.kind}, skipping`);
    return;
  }

  // Idempotency: if this session already has an employerId set, an earlier
  // extraction created the employer + job rows. Skip to avoid wasted Claude
  // spend on Twilio status callback retries.
  if (session.employerId) {
    console.log(`[extract:job] session ${sessionId} already linked to employer, skipping`);
    return;
  }

  const turns = await db()
    .select()
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.ord));
  if (turns.length < 2) {
    console.warn(`[extract:job] session ${sessionId} has ${turns.length} turns — skipping`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[extract:job] ANTHROPIC_API_KEY not set");
    return;
  }
  const client = new Anthropic({ apiKey });

  const transcriptText = turns
    .map((t) => `${t.speaker === "ai" ? "AI" : "Employer"}: ${t.text}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: SYSTEM,
    tools: [SAVE_JOB_TOOL],
    tool_choice: { type: "tool", name: "save_job" },
    messages: [
      {
        role: "user",
        content: `<transcript>\n${transcriptText}\n</transcript>\n\nExtract the job posting.`,
      },
    ],
  });

  const toolUse = message.content.find(
    (b) => b.type === "tool_use" && b.name === "save_job",
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    console.warn(`[extract:job] Claude did not call save_job for ${sessionId}`);
    return;
  }
  const input = toolUse.input as SaveJobInput;

  // Upsert employer by email (or by company+name fallback).
  let employerId = session.employerId;
  if (!employerId) {
    if (input.callerEmail) {
      const [existing] = await db()
        .select()
        .from(employers)
        .where(eq(employers.email, input.callerEmail))
        .limit(1);
      if (existing) {
        employerId = existing.id;
      } else {
        const newId = randomUUID();
        const [created] = await db()
          .insert(employers)
          .values({
            id: newId,
            email: input.callerEmail,
            company: input.company,
          })
          .returning();
        employerId = created.id;
      }
    } else {
      // No email — create a stub employer so the job has an FK.
      const newId = randomUUID();
      const [created] = await db()
        .insert(employers)
        .values({
          id: newId,
          email: `pending-${newId.slice(0, 8)}@gig-grab.local`,
          company: input.company,
        })
        .returning();
      employerId = created.id;
    }
    // Link the session to the employer so we don't re-resolve next time.
    await db()
      .update(sessions)
      .set({ employerId })
      .where(eq(sessions.id, sessionId));
  }

  const payDisplay = formatPay(input);
  const jobValues: NewJob = {
    employerId,
    title: input.title,
    location: input.location,
    pay: payDisplay,
    shiftPattern: input.shiftPattern ?? undefined,
    mustHaves: input.mustHaves ?? [],
    dealBreakers: input.dealBreakers ?? [],
    structuredBrief: input.structuredBrief ?? undefined,
    source: "voice",
    status: "active",
    requiredCount: input.requiredCount ?? 1,
  };

  await db().insert(jobs).values(jobValues);
  console.log(`[extract:job] saved job for employer ${employerId}`);
}
