import { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  candidates,
  sessions,
  transcriptTurns,
  profileCards,
  jobs,
  matches,
  type ProfileProject,
} from "@gig-grab/db";
import { eq, asc, and, ilike, sql } from "drizzle-orm";
// sms helpers retained in repo but no longer used by extractProfile —
// the post-call outro instructs callers to log in at giggrab.io.

// Canonical credentials — when a candidate's pronunciation gets garbled
// by STT ("Cisco Gold" instead of "CSCS Gold", "OSHA thirty" instead of
// "OSHA-30"), Claude can match against this list and emit the proper
// canonical form so the recruiter-facing CV is consistent. If the
// transcript phrase doesn't clearly match anything here, Claude keeps
// the candidate's verbatim words rather than guessing.
// Per-session lock to avoid concurrent extracts when the /profile poll
// hits faster than the previous Anthropic call completes.
const snapshotInflight = new Set<string>();

// Self-bootstrap: add new profile_card columns if the prod DB is on an
// older schema version. Runs once per Cloud Run instance. Cheap when
// columns already exist (PG IF NOT EXISTS is a no-op).
let profileSchemaEnsured = false;
export async function ensureProfileSchema(): Promise<void> {
  if (profileSchemaEnsured) return;
  try {
    await db().execute(sql`
      ALTER TABLE profile_cards
        ADD COLUMN IF NOT EXISTS education TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS languages_spoken JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS work_auth TEXT NOT NULL DEFAULT ''
    `);
    profileSchemaEnsured = true;
  } catch (err) {
    console.warn("[profile/migrate] schema ensure failed", err);
  }
}

const CANONICAL_CREDENTIALS = [
  // UK construction / trades
  "CSCS Gold Card",
  "CSCS Black Card",
  "CSCS Green Card",
  "CSCS Blue Card",
  "CSCS Red Card",
  "IPAF 3a",
  "IPAF 3b",
  "IPAF 1b",
  "PASMA",
  "SMSTS",
  "SSSTS",
  "CITB Health & Safety Touch-screen",
  "First Aid at Work",
  // UK healthcare
  "NMC PIN",
  "HCPC registered",
  "GMC registered",
  "Mental Health First Aid",
  // US construction / safety
  "OSHA-10",
  "OSHA-30",
  "OSHA HAZWOPER",
  "ServSafe",
  "Forklift Operator (OSHA)",
  // US commercial driving
  "CDL Class A",
  "CDL Class B",
  // Healthcare (US/global)
  "Registered Nurse (RN)",
  "Licensed Practical Nurse (LPN)",
  "Certified Nursing Assistant (CNA)",
  "BLS certified",
  "ACLS certified",
  // Tech / cloud
  "AWS Certified Solutions Architect",
  "AWS Certified Developer",
  "Google Cloud Professional Cloud Architect",
  "Microsoft Azure Fundamentals (AZ-900)",
  "Microsoft Azure Administrator (AZ-104)",
  "Certified Kubernetes Administrator (CKA)",
  // PM / agile
  "PMP",
  "Certified Scrum Master (CSM)",
  "PRINCE2 Practitioner",
  // Language teaching
  "TEFL",
  "TESOL",
  "CELTA",
];

const PROFILE_EXTRACTION_PROMPT = `You are an expert at distilling a candidate intake call into a structured profile that will appear on a recruiter-facing CV. Read the transcript and produce ONE JSON object matching the schema.

Hard rules:
- If a field wasn't covered in the call, return an empty string "" (or 0 for yearsExperience, [] for arrays). NEVER return "<UNKNOWN>" or a placeholder.
- summary: 1-2 sentences in third person, neutral tone. If the call was clearly a test or had no usable info, summary = "" and we'll show a placeholder in the UI.
- name: first name only is fine. If genuinely not stated, return "".
- title: short noun phrase the candidate used (e.g. "site carpenter"). If they didn't state a trade, return "".

Credential canonicalization:
When the candidate mentions a certificate / ticket / licence / membership, check whether their phrasing matches one of these canonical forms (case-insensitive, STT may have garbled the spelling — e.g. "Cisco Gold" almost certainly means "CSCS Gold Card", "OSHA thirty" means "OSHA-30", "NMC pin" means "NMC PIN"). If a confident match exists, use the canonical form below; otherwise keep the candidate's verbatim words.

Canonical list:
${CANONICAL_CREDENTIALS.map((c) => `- ${c}`).join("\n")}

If the candidate names something not on this list (e.g. a specific degree like "BSc Computer Science", a company-specific cert, an award), keep their phrasing as-is — do not force into the canonical list.`;

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
      education: {
        type: "string",
        description:
          "Highest formal education, in one line. Examples: 'BSc Computer Science, University of Manchester (2018)', 'High school, Glasgow', 'NVQ Level 3 Plumbing'. Empty string if the caller didn't mention any.",
      },
      languagesSpoken: {
        type: "array",
        items: { type: "string" },
        description:
          "Languages the candidate speaks well enough to work in. Examples: ['English', 'Hindi', 'Urdu']. Empty array if only the call language was mentioned.",
      },
      workAuth: {
        type: "string",
        description:
          "Work-authorization status as the caller described it. Examples: 'British citizen', 'US H-1B (sponsored)', 'Indian national, needs sponsorship', 'Permanent resident UK'. Empty string if not discussed.",
      },
      ticketsAndCards: {
        type: "array",
        items: { type: "string" },
        description:
          "Credentials — degrees, certifications, trade tickets, awards, alumni status, professional memberships. Verbatim. Examples: 'CSCS Gold', 'IPAF 3a/3b', 'NMC PIN', 'BSc Computer Science', 'Y Combinator W21 Alumni', 'AWS Solutions Architect'. Include anything verifiable that a recruiter would scan.",
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
      applyIntents: {
        type: "array",
        description:
          "Any specific jobs the candidate asked to APPLY to during THIS call. Include ONLY if the candidate used an explicit apply verb: 'apply', 'sign me up', 'put my name in', 'I want this one', 'yes please / yes apply'. Do NOT include general curiosity ('tell me about', 'what about', 'do you have', 'is there', 'just asking') — those are NOT apply intents. If unsure, leave the array empty. The data is used to actually submit applications on the candidate's behalf.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["roleTitle", "confidence"],
          properties: {
            roleTitle: {
              type: "string",
              description:
                "Role title in the candidate's words. E.g. 'site carpenter', 'A&E nurse', 'product designer at Spotify'.",
            },
            company: {
              type: "string",
              description:
                "Employer name if the candidate said it, otherwise empty string.",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "'high' = candidate used an explicit apply verb AND confirmed company/role; 'medium' = used an apply verb but role/company implied not stated; 'low' = ambiguous (questions, soft interest). Only 'high' will be acted on.",
            },
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
  await ensureProfileSchema();
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

  let [card] = await db()
    .select()
    .from(profileCards)
    .where(eq(profileCards.candidateId, session.candidateId))
    .limit(1);

  // Live-snapshot trigger: when /profile is polled mid-call and the
  // profile card is either missing or stale (>10s old), opportunistically
  // re-extract from the partial transcript. This is the equivalent of
  // VoiceCallView's snapshot loop but for the token-gated /profile page,
  // so a candidate who hits /profile during the call sees the CV fill in
  // every ~5s instead of waiting until the post-call extractor runs.
  // Guarded: only when session is live AND ≥4 turns exist AND a
  // background extract isn't already in flight for this session.
  const cardAge = card ? Date.now() - new Date(card.updatedAt).getTime() : Infinity;
  const SNAPSHOT_STALE_MS = 10_000;
  if (
    session.status === "in_progress" &&
    turns.length >= 4 &&
    cardAge > SNAPSHOT_STALE_MS &&
    !snapshotInflight.has(sessionId)
  ) {
    snapshotInflight.add(sessionId);
    void (async () => {
      try {
        await extractProfile(sessionId);
      } catch (err) {
        console.error("[profile/get] background snapshot failed", err);
      } finally {
        snapshotInflight.delete(sessionId);
      }
    })();
    // Re-read so this response can include the freshly-extracted card if
    // the extractor was very fast. Usually still returns the prior card
    // and the next 5s poll picks up the new one.
    const [refreshed] = await db()
      .select()
      .from(profileCards)
      .where(eq(profileCards.candidateId, session.candidateId))
      .limit(1);
    if (refreshed) card = refreshed;
  }

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
  await ensureProfileSchema();
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
    education?: string;
    languagesSpoken?: string[];
    workAuth?: string;
    ticketsAndCards?: string[];
    recentProjects?: ProfileProject[];
  };

  // MERGE rather than overwrite. A short follow-up call shouldn't blow
  // away the rich profile a previous deep call captured. For each scalar
  // field we keep the new value when it's non-empty, otherwise fall back
  // to the existing row. For arrays we union (de-duped) so successive
  // calls accumulate certs and projects.
  const [existing] = await db()
    .select()
    .from(profileCards)
    .where(eq(profileCards.candidateId, session.candidateId))
    .limit(1);

  const cleanStr = (s: string | null | undefined): string => {
    const t = (s ?? "").trim();
    if (!t || t === "<UNKNOWN>" || t.toLowerCase() === "unknown") return "";
    return t;
  };
  const cleanArr = (xs: string[] | null | undefined): string[] =>
    (xs ?? []).map(cleanStr).filter(Boolean);

  const newName = cleanStr(input.name);
  const newTitle = cleanStr(input.title);
  const newLocation = cleanStr(input.location);
  const newSummary = cleanStr(input.summary);
  const newYears =
    typeof input.yearsExperience === "number" && input.yearsExperience > 0
      ? input.yearsExperience
      : 0;
  const newEducation = cleanStr(input.education);
  const newLanguages = cleanArr(input.languagesSpoken);
  const newWorkAuth = cleanStr(input.workAuth);
  const newTickets = cleanArr(input.ticketsAndCards);
  const newProjects = (input.recentProjects ?? []).filter(
    (p) =>
      p && (cleanStr(p.role) || cleanStr(p.company) || cleanStr(p.description)),
  );

  // Honour manual overrides set by accountProfileUpdate. A field the user
  // has edited via the dashboard must NOT be silently rewritten by a
  // later extraction pass; the candidate's correction is authoritative.
  const ov = existing?.manualOverrides ?? {};
  const pick = <T>(field: keyof typeof ov, fresh: T, kept: T): T =>
    ov[field] ? kept : fresh;

  const merged = {
    name: pick("name", newName || existing?.name || "", existing?.name ?? ""),
    title: pick(
      "title",
      newTitle || existing?.title || "",
      existing?.title ?? "",
    ),
    location: pick(
      "location",
      newLocation || existing?.location || "",
      existing?.location ?? "",
    ),
    summary: pick(
      "summary",
      newSummary || existing?.summary || "",
      existing?.summary ?? "",
    ),
    yearsExperience: pick(
      "yearsExperience",
      Math.max(newYears, existing?.yearsExperience ?? 0),
      existing?.yearsExperience ?? 0,
    ),
    education: pick(
      "education",
      newEducation || existing?.education || "",
      existing?.education ?? "",
    ),
    languagesSpoken: pick(
      "languagesSpoken",
      dedupeStrings([
        ...(existing?.languagesSpoken ?? []),
        ...newLanguages,
      ]),
      existing?.languagesSpoken ?? [],
    ),
    workAuth: pick(
      "workAuth",
      newWorkAuth || existing?.workAuth || "",
      existing?.workAuth ?? "",
    ),
    ticketsAndCards: pick(
      "ticketsAndCards",
      dedupeStrings([
        ...(existing?.ticketsAndCards ?? []),
        ...newTickets,
      ]),
      existing?.ticketsAndCards ?? [],
    ),
    recentProjects: pick(
      "recentProjects",
      dedupeProjects([
        ...(existing?.recentProjects ?? []),
        ...newProjects,
      ]),
      existing?.recentProjects ?? [],
    ),
  };

  await db()
    .insert(profileCards)
    .values({
      candidateId: session.candidateId,
      ...merged,
    })
    .onConflictDoUpdate({
      target: profileCards.candidateId,
      set: { ...merged, updatedAt: new Date() },
    });
  console.log(
    `[extract] merged profile for ${sessionId}` +
      ` (name=${merged.name || "—"} title=${merged.title || "—"}` +
      ` years=${merged.yearsExperience}` +
      ` tickets=${merged.ticketsAndCards.length}` +
      ` projects=${merged.recentProjects.length})`,
  );

  // Re-embed the candidate so semantic match queries from the employer
  // side pick up the latest profile state. Fire-and-forget: failure
  // here doesn't break the extraction; the next edit will retry.
  void (async () => {
    try {
      const { embedCandidate } = await import("./embeddings");
      await embedCandidate(session.candidateId!);
    } catch (err) {
      console.error("[embed:candidate] failed", err);
    }
  })();

  // Process any apply-intents Claude detected in the transcript. For
  // each, fuzzy-match against the active jobs table by title (+company
  // if provided) and upsert a matches row with status='applied'. This
  // is what makes "I want to apply for the carpenter at Bayford" during
  // a hotline call surface in the dashboard as an Applied job, with no
  // tool-use plumbing required in the agent.
  type ApplyIntentInput = {
    roleTitle?: string;
    company?: string;
    confidence?: "high" | "medium" | "low";
  };
  const applyIntents: ApplyIntentInput[] = Array.isArray(
    (input as unknown as { applyIntents?: unknown }).applyIntents,
  )
    ? ((input as unknown as { applyIntents: ApplyIntentInput[] })
        .applyIntents ?? [])
    : [];
  for (const raw of applyIntents) {
    const role = cleanStr(raw?.roleTitle ?? "");
    const company = cleanStr(raw?.company ?? "");
    if (!role) continue;
    // Only act on 'high'-confidence applies — anything else gets logged
    // and surfaced as a 'suggested' match for the user to confirm in the
    // web UI. Without this gate, Claude hallucinates apply intent from
    // general curiosity questions and submits real applications.
    const confidence = raw?.confidence ?? "low";
    const writeStatus: "applied" | "suggested" =
      confidence === "high" ? "applied" : "suggested";
    try {
      const conds = [
        eq(jobs.status, "active"),
        ilike(jobs.title, `%${role}%`),
      ];
      if (company) {
        conds.push(sql`structured_brief->>'company' ILIKE ${`%${company}%`}`);
      }
      const [hit] = await db()
        .select({ id: jobs.id, title: jobs.title })
        .from(jobs)
        .where(and(...conds))
        .orderBy(sql`${jobs.createdAt} desc`)
        .limit(1);
      if (!hit) {
        console.log(
          `[apply:phone] no job match for "${role}"${company ? ` @ "${company}"` : ""}`,
        );
        continue;
      }
      const insertRow = {
        candidateId: session.candidateId,
        jobId: hit.id,
        score: "0.900",
        whyRanked: `Phone apply (${confidence}): "${role}"${company ? ` @ "${company}"` : ""}`,
        status: writeStatus,
      };
      if (writeStatus === "applied") {
        // High-confidence: write/escalate to applied.
        await db()
          .insert(matches)
          .values(insertRow)
          .onConflictDoUpdate({
            target: [matches.candidateId, matches.jobId],
            set: { status: "applied", updatedAt: new Date() },
          });
      } else {
        // Low/medium-confidence: only insert if no row exists yet; never
        // downgrade an existing `applied`/`screened`/`shortlisted` row.
        await db()
          .insert(matches)
          .values(insertRow)
          .onConflictDoNothing({
            target: [matches.candidateId, matches.jobId],
          });
      }
      console.log(
        `[apply:phone] cand=${session.candidateId.slice(0, 8)} job=${hit.id.slice(0, 8)} (${hit.title})`,
      );
    } catch (err) {
      console.error(`[apply:phone] failed for "${role}"`, err);
    }
  }

  // Post-call SMS link removed — the new outro tells callers to log on
  // to giggrab.io with their phone number instead. Phone-OTP sign-in
  // (accountPhoneConfirm) merges the hotline candidate row into the
  // signed-in account, which is the same merge the SMS link used to
  // skip via the session HMAC token.
}

// ---------------------------------------------------------------------------
// Helpers used by the merge logic above.
// ---------------------------------------------------------------------------

function dedupeStrings(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const t = (x ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function dedupeProjects(xs: ProfileProject[]): ProfileProject[] {
  const out: ProfileProject[] = [];
  const seen = new Set<string>();
  for (const p of xs) {
    if (!p) continue;
    const role = (p.role ?? "").trim();
    const company = (p.company ?? "").trim();
    const period = (p.period ?? "").trim();
    if (!role && !company) continue; // empty placeholder
    const key = `${role.toLowerCase()}|${company.toLowerCase()}|${period.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role, company, period, description: (p.description ?? "").trim() });
  }
  return out;
}
