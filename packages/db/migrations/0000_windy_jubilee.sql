CREATE TYPE "public"."alert_channel" AS ENUM('sms', 'whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."ats_provider" AS ENUM('greenhouse', 'workable', 'ashby', 'bamboohr');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('ai', 'human');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('voice', 'upload', 'link', 'ats');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('active', 'interviewing', 'paused', 'filled');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('suggested', 'applied', 'screened', 'shortlisted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('candidate_intake', 'employer_intake', 'ai_screening', 'human_interview');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('ringing', 'in_progress', 'completed', 'abandoned', 'failed');--> statement-breakpoint
CREATE TYPE "public"."speaker" AS ENUM('candidate', 'employer', 'ai');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" text,
	"employer_id" text,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"channel" "alert_channel" NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ats_connections" (
	"employer_id" text PRIMARY KEY NOT NULL,
	"provider" "ats_provider" NOT NULL,
	"account_id" text NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auto_apply_rules" (
	"candidate_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"pay_floor" integer,
	"pay_currency" varchar(3),
	"max_commute_minutes" integer,
	"shift_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_applies_per_week" integer DEFAULT 20 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" varchar(32) NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"email" text,
	"cv_url" text,
	"linkedin_id" text,
	"match_signals" jsonb,
	"profile_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_call_at" timestamp with time zone,
	CONSTRAINT "candidates_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"calendar_id" text,
	"calendar_provider" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"type" "interview_type" NOT NULL,
	"slot" timestamp with time zone NOT NULL,
	"calendar_event_id" text,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" text NOT NULL,
	"title" text NOT NULL,
	"location" text NOT NULL,
	"pay" text,
	"shift_pattern" text,
	"must_haves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deal_breakers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"structured_brief" jsonb,
	"source" "job_source" NOT NULL,
	"status" "job_status" DEFAULT 'active' NOT NULL,
	"embedding" vector(1536),
	"required_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"score" numeric(4, 3) NOT NULL,
	"why_ranked" text NOT NULL,
	"status" "match_status" DEFAULT 'suggested' NOT NULL,
	"interview_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_candidate_job_uniq" UNIQUE("candidate_id","job_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_cards" (
	"candidate_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"years_experience" integer NOT NULL,
	"location" text NOT NULL,
	"summary" text NOT NULL,
	"tickets_and_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recent_projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "session_kind" NOT NULL,
	"candidate_id" text,
	"employer_id" text,
	"job_id" uuid,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"status" "session_status" DEFAULT 'ringing' NOT NULL,
	"audio_url" text,
	"twilio_call_sid" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transcript_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"speaker" "speaker" NOT NULL,
	"text" text NOT NULL,
	"ms_offset" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_session_ord_uniq" UNIQUE("session_id","ord")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ats_connections" ADD CONSTRAINT "ats_connections_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auto_apply_rules" ADD CONSTRAINT "auto_apply_rules_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interviews" ADD CONSTRAINT "interviews_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_cards" ADD CONSTRAINT "profile_cards_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_candidate_idx" ON "alerts" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_employer_idx" ON "alerts" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_kind_idx" ON "alerts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidates_phone_idx" ON "candidates" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidates_embedding_idx" ON "candidates" USING hnsw ("profile_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidates_language_idx" ON "candidates" USING btree ("language");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_candidate_idx" ON "interviews" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_job_idx" ON "interviews" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_slot_idx" ON "interviews" USING btree ("slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_employer_idx" ON "jobs" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_embedding_idx" ON "jobs" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_job_score_idx" ON "matches" USING btree ("job_id","score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_candidate_idx" ON "matches" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_candidate_idx" ON "sessions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_employer_idx" ON "sessions" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_job_idx" ON "sessions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_kind_idx" ON "sessions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcripts_session_ord_idx" ON "transcript_turns" USING btree ("session_id","ord");