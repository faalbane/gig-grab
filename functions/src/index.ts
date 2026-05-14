import { onRequest, Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { initializeApp } from "firebase-admin/app";
import { db, candidates } from "@gig-grab/db";
import { count } from "drizzle-orm";
import { intakeStart } from "./intake";
import {
  twilioVoice,
  twilioStatus,
  twilioInbound,
  twilioInboundStatus,
} from "./twilio-webhook";
import { sessionProfileGet } from "./profile";
import { sessionStatusGet, sessionTurnsGet } from "./sessions";
import { sessionCvPdf } from "./cv-pdf";
import { authLink } from "./auth";
import {
  accountMe,
  accountProfileUpdate,
  accountPhoneStart,
  accountPhoneConfirm,
  accountWebCallStart,
  accountEmailUpdate,
  accountDelete,
  sessionExtractSnapshot,
  sessionExtractJobSnapshot,
} from "./account";
import {
  jobsIngestAdzuna,
  jobsIngestAdzunaRefreshAll,
  accountJobsList,
  accountJobsApply,
} from "./jobs-ingest-adzuna";
import { adminRerunExtract, adminEmbedBackfill } from "./admin";
import { employerMe, employerJobMatches } from "./employer";

initializeApp();

const SECRETS = [
  "DATABASE_URL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_VERIFY_SERVICE_SID",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "SESSION_SECRET",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "INGEST_SECRET",
];

/**
 * Strip the `/api` prefix that Firebase Hosting rewrites add.
 * Local: paths arrive as `/intake/start`.
 * Hosted via /api/** rewrite: paths arrive as `/api/intake/start`.
 */
function normalizePath(req: Request): string {
  const p = (req.path ?? "/").replace(/^\/api(?=\/|$)/, "");
  return p === "" ? "/" : p;
}

async function health(_req: Request, res: Response): Promise<void> {
  let dbStatus: "ok" | "unconfigured" | "error" = "unconfigured";
  let candidateCount: number | null = null;
  if (process.env.DATABASE_URL) {
    try {
      const [{ value }] = await db().select({ value: count() }).from(candidates);
      candidateCount = Number(value);
      dbStatus = "ok";
    } catch (err) {
      console.error("DB query failed", err);
      dbStatus = "error";
    }
  }
  res.json({
    service: "gig-grab",
    status: "ok",
    db: dbStatus,
    candidateCount,
    time: new Date().toISOString(),
  });
}

// CORS allowlist — Firebase ID tokens are origin-scoped at the SDK
// level, but `cors: true` reflects any Origin and is the wrong default
// for an account API that owns destructive endpoints like DELETE /account.
// Listed entries: production apex, legacy hosting alias kept during the
// domain cutover, dev origins.
const CORS_ORIGINS = [
  /^https:\/\/giggrab\.io$/,
  /^https:\/\/www\.giggrab\.io$/,
  /^https:\/\/gig-grab\.web\.app$/,
  /^https:\/\/gig-grab\.firebaseapp\.com$/,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];

export const api = onRequest(
  {
    region: "europe-west2",
    cors: CORS_ORIGINS,
    secrets: SECRETS,
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (req, res) => {
    const path = normalizePath(req);
    const method = req.method.toUpperCase();

    try {
      if (method === "GET" && (path === "/" || path === "/health")) {
        await health(req, res);
        return;
      }
      if (method === "POST" && path === "/intake/start") {
        await intakeStart(req, res);
        return;
      }
      const voiceMatch = path.match(/^\/twilio\/voice\/([0-9a-f-]{36})$/);
      if (voiceMatch && (method === "GET" || method === "POST")) {
        await twilioVoice(req, res, voiceMatch[1]);
        return;
      }
      const statusMatch = path.match(/^\/twilio\/status\/([0-9a-f-]{36})$/);
      if (statusMatch && method === "POST") {
        await twilioStatus(req, res, statusMatch[1]);
        return;
      }
      if (method === "POST" && path === "/twilio/inbound") {
        await twilioInbound(req, res);
        return;
      }
      if (
        method === "POST" &&
        (path === "/twilio/status" || path === "/twilio/inbound-status")
      ) {
        await twilioInboundStatus(req, res);
        return;
      }
      const rerunMatch = path.match(
        /^\/admin\/rerun-extract\/([0-9a-f-]{36})$/,
      );
      if (rerunMatch && method === "POST") {
        await adminRerunExtract(req, res, rerunMatch[1]);
        return;
      }
      if (method === "POST" && path === "/admin/embed-backfill") {
        await adminEmbedBackfill(req, res);
        return;
      }
      const profileMatch = path.match(
        /^\/sessions\/([0-9a-f-]{36})\/profile$/,
      );
      if (profileMatch && method === "GET") {
        await sessionProfileGet(req, res, profileMatch[1]);
        return;
      }
      const statusMatchSession = path.match(
        /^\/sessions\/([0-9a-f-]{36})\/status$/,
      );
      if (statusMatchSession && method === "GET") {
        await sessionStatusGet(req, res, statusMatchSession[1]);
        return;
      }
      const turnsMatch = path.match(
        /^\/sessions\/([0-9a-f-]{36})\/turns$/,
      );
      if (turnsMatch && method === "GET") {
        await sessionTurnsGet(req, res, turnsMatch[1]);
        return;
      }
      const cvPdfMatch = path.match(
        /^\/sessions\/([0-9a-f-]{36})\/cv\.pdf$/,
      );
      if (cvPdfMatch && method === "GET") {
        await sessionCvPdf(req, res, cvPdfMatch[1]);
        return;
      }
      const snapshotMatch = path.match(
        /^\/sessions\/([0-9a-f-]{36})\/extract-snapshot$/,
      );
      if (snapshotMatch && method === "POST") {
        await sessionExtractSnapshot(req, res, snapshotMatch[1]);
        return;
      }
      const jobSnapshotMatch = path.match(
        /^\/sessions\/([0-9a-f-]{36})\/extract-job-snapshot$/,
      );
      if (jobSnapshotMatch && method === "POST") {
        await sessionExtractJobSnapshot(req, res, jobSnapshotMatch[1]);
        return;
      }
      if (method === "POST" && path === "/auth/link") {
        await authLink(req, res);
        return;
      }
      if (method === "GET" && path === "/account/me") {
        await accountMe(req, res);
        return;
      }
      if (
        (method === "PUT" || method === "PATCH") &&
        path === "/account/profile"
      ) {
        await accountProfileUpdate(req, res);
        return;
      }
      if (method === "POST" && path === "/account/phone/start") {
        await accountPhoneStart(req, res);
        return;
      }
      if (method === "POST" && path === "/account/phone/confirm") {
        await accountPhoneConfirm(req, res);
        return;
      }
      if (method === "POST" && path === "/account/web-call/start") {
        await accountWebCallStart(req, res);
        return;
      }
      if (method === "POST" && path === "/account/email") {
        await accountEmailUpdate(req, res);
        return;
      }
      if (method === "DELETE" && path === "/account") {
        await accountDelete(req, res);
        return;
      }
      if (method === "GET" && path === "/account/jobs") {
        await accountJobsList(req, res);
        return;
      }
      if (method === "GET" && path === "/account/employer/me") {
        await employerMe(req, res);
        return;
      }
      const empMatchMatch = path.match(
        /^\/account\/employer\/jobs\/([0-9a-f-]{36})\/matches$/,
      );
      if (empMatchMatch && method === "GET") {
        await employerJobMatches(req, res, empMatchMatch[1]);
        return;
      }
      const applyMatch = path.match(
        /^\/account\/jobs\/([0-9a-f-]{36})\/apply$/,
      );
      if (applyMatch && method === "POST") {
        await accountJobsApply(req, res, applyMatch[1]);
        return;
      }
      if (method === "POST" && path === "/jobs/ingest/adzuna") {
        await jobsIngestAdzuna(req, res);
        return;
      }
      if (method === "POST" && path === "/jobs/ingest/adzuna/refresh-all") {
        await jobsIngestAdzunaRefreshAll(req, res);
        return;
      }
      res.status(404).json({ error: "not found", path });
    } catch (err) {
      console.error("Unhandled error", err);
      res.status(500).json({ error: "internal error" });
    }
  },
);
