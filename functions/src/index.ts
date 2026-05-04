import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";

initializeApp();

// Health check — confirms deploy works end-to-end.
export const api = onRequest(
  { region: "europe-west1", cors: true },
  (req, res) => {
    res.json({
      service: "gig-grab",
      status: "ok",
      version: "0.0.0",
      time: new Date().toISOString(),
    });
  },
);

// TODO Phase 1: Twilio webhook for inbound calls -> Pipecat dispatch
// TODO Phase 1: Twilio Verify OTP relay
// TODO Phase 2: JD upload parser (Claude Sonnet 4.6)
// TODO Phase 3: auto-apply scheduler (cron)
// TODO Phase 3: Hiring Copilot tool router
