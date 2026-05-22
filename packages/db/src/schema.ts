import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

// ===========================================================================
// Enums
// ===========================================================================

export const jobSourceEnum = pgEnum("job_source", ["voice", "upload", "link", "ats"]);
export const jobStatusEnum = pgEnum("job_status", [
  "active",
  "interviewing",
  "paused",
  "filled",
]);
export const matchStatusEnum = pgEnum("match_status", [
  "suggested",
  "applied",
  "screened",
  "shortlisted",
  "rejected",
]);
export const interviewTypeEnum = pgEnum("interview_type", ["ai", "human"]);
export const speakerEnum = pgEnum("speaker", ["candidate", "employer", "ai"]);
export const atsProviderEnum = pgEnum("ats_provider", [
  "greenhouse",
  "workable",
  "ashby",
  "bamboohr",
]);
export const sessionKindEnum = pgEnum("session_kind", [
  "candidate_intake",
  "employer_intake",
  "ai_screening",
  "human_interview",
]);
export const sessionStatusEnum = pgEnum("session_status", [
  "ringing",
  "in_progress",
  "completed",
  "abandoned",
  "failed",
]);
export const alertChannelEnum = pgEnum("alert_channel", ["sms", "whatsapp", "email"]);

// ===========================================================================
// Candidates
// PK = Firebase Auth UID. Profile embedding for vector matching.
// ===========================================================================

export type CandidateMatchSignals = {
  trade?: string;
  yearsExperience?: number;
  certs?: string[];
  recentLocations?: string[];
  travelWillingness?: string;
  availability?: string;
  payFloor?: number;
  payCurrency?: "GBP" | "USD" | "EUR" | string;
  shiftPreferences?: string[];
  dealBreakers?: string[];
  // Cached intent for hotline callers. Set on first call (post-call
  // transcript classifier) so subsequent calls skip the intent question
  // and load the right system prompt directly.
  audience?: "worker" | "employer";
};

export const candidates = pgTable(
  "candidates",
  {
    id: text("id").primaryKey(),
    firebaseUid: text("firebase_uid").unique(),
    phone: varchar("phone", { length: 32 }).notNull().unique(),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    email: text("email"),
    cvUrl: text("cv_url"),
    linkedinId: text("linkedin_id"),
    matchSignals: jsonb("match_signals").$type<CandidateMatchSignals>(),
    profileEmbedding: vector("profile_embedding", { dimensions: 1536 }),
    // Stripe billing state — inline since pilot is 1 active subscription
    // per candidate. Split into its own table when teams/seats land.
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    billingTier: text("billing_tier").$type<CandidateBillingTier>(),
    billingStatus: text("billing_status"),
    billingPeriodEnd: timestamp("billing_period_end", { withTimezone: true }),
    applicationsRemaining: integer("applications_remaining").notNull().default(0),
    applicationsResetAt: timestamp("applications_reset_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastCallAt: timestamp("last_call_at", { withTimezone: true }),
  },
  (t) => [
    index("candidates_phone_idx").on(t.phone),
    index("candidates_embedding_idx").using(
      "hnsw",
      t.profileEmbedding.op("vector_cosine_ops"),
    ),
    index("candidates_language_idx").on(t.language),
  ],
);

// ===========================================================================
// Profile cards (1:1 with candidates) — what renders in the CV preview.
// Sections kept loose (jsonb) because the AI shapes them per role/vertical.
// ===========================================================================

export type ProfileProject = {
  role: string;
  company: string;
  period: string;
  description?: string;
};

/** Per-field manual-override flags. Set true for any field the user has
 * edited via PUT /api/account/profile so subsequent transcript extracts
 * don't clobber the manual value with a freshly-extracted one. */
export type CandidateBillingTier = "starter" | "professional" | "premium";

export type ProfileManualOverrides = Partial<{
  name: boolean;
  title: boolean;
  yearsExperience: boolean;
  location: boolean;
  summary: boolean;
  education: boolean;
  languagesSpoken: boolean;
  workAuth: boolean;
  ticketsAndCards: boolean;
  recentProjects: boolean;
}>;

export const profileCards = pgTable("profile_cards", {
  candidateId: text("candidate_id")
    .primaryKey()
    .references(() => candidates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title").notNull(),
  yearsExperience: integer("years_experience").notNull(),
  location: text("location").notNull(),
  summary: text("summary").notNull(),
  // Free-form education line — e.g. "BSc Computer Science, University of
  // Manchester (2018)". Captured in the Sarah intake call.
  education: text("education").notNull().default(""),
  // Languages the candidate speaks fluently enough to work in. Distinct
  // from `candidates.language` which is just the call-language preference.
  languagesSpoken: jsonb("languages_spoken").$type<string[]>().notNull().default([]),
  // Work-authorization status — e.g. "British citizen", "US H-1B",
  // "Indian national, needs sponsorship". Material for employer fit.
  workAuth: text("work_auth").notNull().default(""),
  ticketsAndCards: jsonb("tickets_and_cards").$type<string[]>().notNull().default([]),
  recentProjects: jsonb("recent_projects")
    .$type<ProfileProject[]>()
    .notNull()
    .default([]),
  manualOverrides: jsonb("manual_overrides")
    .$type<ProfileManualOverrides>()
    .notNull()
    .default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ===========================================================================
// Sessions — every voice interaction (intake calls, AI screenings, interviews).
// Transcript lives in transcript_turns; raw audio (if recorded) in object storage.
// ===========================================================================

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: sessionKindEnum("kind").notNull(),
    candidateId: text("candidate_id").references(() => candidates.id, {
      onDelete: "cascade",
    }),
    employerId: text("employer_id").references(() => employers.id, {
      onDelete: "cascade",
    }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    status: sessionStatusEnum("status").notNull().default("ringing"),
    audioUrl: text("audio_url"),
    twilioCallSid: text("twilio_call_sid"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("sessions_candidate_idx").on(t.candidateId),
    index("sessions_employer_idx").on(t.employerId),
    index("sessions_job_idx").on(t.jobId),
    index("sessions_kind_idx").on(t.kind),
  ],
);

export const transcriptTurns = pgTable(
  "transcript_turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    speaker: speakerEnum("speaker").notNull(),
    text: text("text").notNull(),
    msOffset: integer("ms_offset").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("transcripts_session_ord_idx").on(t.sessionId, t.ord),
    unique("transcripts_session_ord_uniq").on(t.sessionId, t.ord),
  ],
);

// ===========================================================================
// Employers
// ===========================================================================

export const employers = pgTable("employers", {
  id: text("id").primaryKey(),
  firebaseUid: text("firebase_uid").unique(),
  email: text("email").notNull().unique(),
  company: text("company").notNull(),
  calendarId: text("calendar_id"),
  calendarProvider: varchar("calendar_provider", { length: 16 }), // google | microsoft
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const atsConnections = pgTable("ats_connections", {
  employerId: text("employer_id")
    .primaryKey()
    .references(() => employers.id, { onDelete: "cascade" }),
  provider: atsProviderEnum("provider").notNull(),
  accountId: text("account_id").notNull(),
  accessTokenEnc: text("access_token_enc"), // KMS-encrypted token blob
  refreshTokenEnc: text("refresh_token_enc"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
});

// ===========================================================================
// Jobs — pay/location free text now; structured fields can be added when we
// see what employers actually input (don't over-engineer the salary model).
// ===========================================================================

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employerId: text("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    location: text("location").notNull(),
    pay: text("pay"),
    shiftPattern: text("shift_pattern"),
    mustHaves: jsonb("must_haves").$type<string[]>().notNull().default([]),
    dealBreakers: jsonb("deal_breakers").$type<string[]>().notNull().default([]),
    structuredBrief: jsonb("structured_brief"), // {projectScope, whatYoullNeed, rateAndTiming, ...}
    source: jobSourceEnum("source").notNull(),
    status: jobStatusEnum("status").notNull().default("active"),
    embedding: vector("embedding", { dimensions: 1536 }),
    requiredCount: integer("required_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("jobs_employer_idx").on(t.employerId),
    index("jobs_status_idx").on(t.status),
    index("jobs_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// ===========================================================================
// Matches — denormalized scoring + reason. (candidate_id, job_id) is unique;
// we recompute scores when either side changes.
// ===========================================================================

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 4, scale: 3 }).notNull(), // 0.000 .. 1.000
    whyRanked: text("why_ranked").notNull(),
    // Per-pillar breakdown for the candidate-facing match UI. Shape:
    //   { experience: 0-100, skills: 0-100, industry: 0-100, rationale?: string }
    // Null until the candidate (or employer rerank) actually requests
    // a scoring pass. Cheaper than always running an LLM call on list view.
    scoreBreakdown: jsonb("score_breakdown").$type<{
      experience?: number;
      skills?: number;
      industry?: number;
      rationale?: string;
    }>(),
    status: matchStatusEnum("status").notNull().default("suggested"),
    interviewId: uuid("interview_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("matches_candidate_job_uniq").on(t.candidateId, t.jobId),
    index("matches_job_score_idx").on(t.jobId, t.score),
    index("matches_candidate_idx").on(t.candidateId),
    index("matches_status_idx").on(t.status),
  ],
);

// ===========================================================================
// Interviews
// ===========================================================================

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    type: interviewTypeEnum("type").notNull(),
    slot: timestamp("slot", { withTimezone: true }).notNull(),
    calendarEventId: text("calendar_event_id"),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("interviews_candidate_idx").on(t.candidateId),
    index("interviews_job_idx").on(t.jobId),
    index("interviews_slot_idx").on(t.slot),
  ],
);

// ===========================================================================
// Auto-apply rules (Phase 3)
// ===========================================================================

export const autoApplyRules = pgTable("auto_apply_rules", {
  candidateId: text("candidate_id")
    .primaryKey()
    .references(() => candidates.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  payFloor: integer("pay_floor"),
  payCurrency: varchar("pay_currency", { length: 3 }),
  maxCommuteMinutes: integer("max_commute_minutes"),
  shiftTypes: jsonb("shift_types").$type<string[]>().notNull().default([]),
  languages: jsonb("languages").$type<string[]>().notNull().default([]),
  maxAppliesPerWeek: integer("max_applies_per_week").notNull().default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ===========================================================================
// Alerts log (Phase 3) — append-only audit of outbound notifications
// ===========================================================================

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateId: text("candidate_id").references(() => candidates.id, {
      onDelete: "set null",
    }),
    employerId: text("employer_id").references(() => employers.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(), // 'top_match' | 'employer_response' | 'interview_invite' | ...
    payload: jsonb("payload").notNull(),
    channel: alertChannelEnum("channel").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("alerts_candidate_idx").on(t.candidateId),
    index("alerts_employer_idx").on(t.employerId),
    index("alerts_kind_idx").on(t.kind),
  ],
);

// ===========================================================================
// Required Postgres extensions — drizzle-kit emits this in migrations
// ===========================================================================

export const requiredExtensions = sql`
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
`;

// ===========================================================================
// Inferred types — re-export for app code
// ===========================================================================

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type ProfileCard = typeof profileCards.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type TranscriptTurn = typeof transcriptTurns.$inferSelect;
export type Employer = typeof employers.$inferSelect;
export type AtsConnection = typeof atsConnections.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type AutoApplyRule = typeof autoApplyRules.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
