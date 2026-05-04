import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { db, candidates } from "@gig-grab/db";
import { count } from "drizzle-orm";

initializeApp();

// Health check — confirms deploy + DB connection.
export const api = onRequest(
  { region: "europe-west1", cors: true, secrets: ["DATABASE_URL"] },
  async (_req, res) => {
    let dbStatus: "ok" | "unconfigured" | "error" = "unconfigured";
    let candidateCount: number | null = null;
    if (process.env.DATABASE_URL) {
      try {
        const [{ value }] = await db()
          .select({ value: count() })
          .from(candidates);
        candidateCount = Number(value);
        dbStatus = "ok";
      } catch {
        dbStatus = "error";
      }
    }
    res.json({
      service: "gig-grab",
      status: "ok",
      version: "0.0.0",
      db: dbStatus,
      candidateCount,
      time: new Date().toISOString(),
    });
  },
);

// TODO Phase 1: Twilio webhook for inbound calls -> Pipecat dispatch
// TODO Phase 1: Twilio Verify OTP relay
// TODO Phase 2: JD upload parser (Claude Sonnet 4.6)
// TODO Phase 3: auto-apply scheduler (cron)
// TODO Phase 3: Hiring Copilot tool router
