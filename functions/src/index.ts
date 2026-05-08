import { onRequest, Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { initializeApp } from "firebase-admin/app";
import { db, candidates } from "@gig-grab/db";
import { count } from "drizzle-orm";
import { intakeStart } from "./intake";
import { twilioVoice, twilioStatus } from "./twilio-webhook";
import { sessionProfileGet } from "./profile";
import { sessionStatusGet, sessionTurnsGet } from "./sessions";
import { authLink } from "./auth";
import {
  accountMe,
  accountPhoneStart,
  accountPhoneConfirm,
} from "./account";

initializeApp();

const SECRETS = [
  "DATABASE_URL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_VERIFY_SERVICE_SID",
  "ANTHROPIC_API_KEY",
  "SESSION_SECRET",
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

export const api = onRequest(
  {
    region: "europe-west2",
    cors: true,
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
      if (method === "POST" && path === "/auth/link") {
        await authLink(req, res);
        return;
      }
      if (method === "GET" && path === "/account/me") {
        await accountMe(req, res);
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
      res.status(404).json({ error: "not found", path });
    } catch (err) {
      console.error("Unhandled error", err);
      res.status(500).json({ error: "internal error" });
    }
  },
);
