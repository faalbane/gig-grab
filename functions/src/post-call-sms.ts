/**
 * Post-call trust-builder: after the hotline call ends and extractProfile
 * has populated profile_cards + the candidate embedding, send the caller
 * a short SMS (or WhatsApp, when approved) with their top 3 live job
 * matches and a deep link to the dashboard.
 *
 * Why this exists: Reddit feedback flagged the voice flow as feeling
 * "scammy" when an AI on the phone hints at any payment / identity
 * step. Delivering the first concrete value (job matches) via a channel
 * the user already trusts (their own SMS thread) before any commercial
 * conversation lowers the trust threshold materially.
 *
 * Channel selection: defaults to SMS so it works the moment Twilio is
 * configured. WhatsApp is available when TWILIO_WHATSAPP_FROM is set
 * AND OUTBOUND_FIRST_MESSAGE_CHANNEL=whatsapp (so we don't accidentally
 * try WA on a non-opted-in recipient).
 */

import { db, candidates, profileCards, jobs } from "@gig-grab/db";
import { eq, sql } from "drizzle-orm";
import { sendSms } from "./sms";

type Channel = "sms" | "whatsapp";

function preferredChannel(): Channel {
  return process.env.OUTBOUND_FIRST_MESSAGE_CHANNEL === "whatsapp"
    ? "whatsapp"
    : "sms";
}

function publicWebOrigin(): string {
  return process.env.PUBLIC_WEB_URL ?? "https://giggrab.io";
}

function normaliseCityForFilter(loc: string | null): string {
  if (!loc) return "";
  return loc
    .split(",")[0]
    .trim()
    .replace(/\s+city\s*$/i, "")
    .trim()
    .slice(0, 80);
}

function shortPay(pay: string | null): string {
  if (!pay) return "";
  const trimmed = pay.trim();
  if (!trimmed) return "";
  // Trim long blurbs like "$25-$30 / hour · 40h / week" to the first
  // amount segment so the SMS doesn't run multi-line per job.
  return trimmed.split("·")[0]!.trim().slice(0, 28);
}

function shortLocation(loc: string | null): string {
  if (!loc) return "";
  // Adzuna returns things like "Addicks, Houston, TX" — keep the first
  // two segments so the recipient still recognises the area.
  const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, 2).join(", ").slice(0, 48);
}

function firstName(full: string | null): string {
  if (!full) return "there";
  const f = full.trim().split(/\s+/)[0]!;
  return f || "there";
}

export type SendPostCallMatchesResult = {
  ok: boolean;
  reason?: string;
  sid?: string;
  channel?: Channel;
  count?: number;
};

export async function sendPostCallMatches(
  candidateId: string,
): Promise<SendPostCallMatchesResult> {
  const [cand] = await db()
    .select({
      id: candidates.id,
      phone: candidates.phone,
      embedding: candidates.profileEmbedding,
      name: profileCards.name,
      location: profileCards.location,
    })
    .from(candidates)
    .leftJoin(profileCards, eq(profileCards.candidateId, candidates.id))
    .where(eq(candidates.id, candidateId))
    .limit(1);

  if (!cand) return { ok: false, reason: "candidate not found" };
  if (!cand.phone || !cand.phone.startsWith("+")) {
    return { ok: false, reason: "no e164 phone on file" };
  }
  if (!cand.embedding) {
    return { ok: false, reason: "no embedding yet — skipping" };
  }

  // Vector cosine top-3 with the same city-filter logic the dashboard
  // uses. If the city has 0 active jobs, drop the filter so we send
  // *something* useful instead of nothing.
  const city = normaliseCityForFilter(cand.location);
  const vecLit = `[${cand.embedding.join(",")}]`;
  const cityLike = city.length >= 3 ? `%${city}%` : null;

  type MatchRow = {
    id: string;
    title: string;
    company: string | null;
    location: string;
    pay: string | null;
  };

  async function fetchTopN(useCity: boolean, n: number): Promise<MatchRow[]> {
    const conds = [eq(jobs.status, "active"), sql`${jobs.embedding} IS NOT NULL`];
    if (useCity && cityLike) {
      conds.push(sql`${jobs.location} ILIKE ${cityLike}`);
    }
    const rows = await db()
      .select({
        id: jobs.id,
        title: jobs.title,
        // Adzuna + employer-voice rows both stash the display name in
        // structured_brief.company. Keep this as a JSON pluck instead
        // of joining `employers` because Adzuna rows reuse a synthetic
        // employer per source whose `company` column is generic.
        company: sql<string | null>`(${jobs.structuredBrief}->>'company')`,
        location: jobs.location,
        pay: jobs.pay,
      })
      .from(jobs)
      .where(sql.join(conds, sql` AND `))
      .orderBy(sql`${jobs.embedding} <=> ${vecLit}::vector`)
      .limit(n);
    return rows;
  }

  let rows = await fetchTopN(true, 3);
  let usedCity = true;
  if (rows.length === 0 && cityLike) {
    rows = await fetchTopN(false, 3);
    usedCity = false;
  }
  if (rows.length === 0) {
    return { ok: false, reason: "no matches available" };
  }

  const numberEmojis = ["1️⃣", "2️⃣", "3️⃣"];
  const lines = rows.slice(0, 3).map((r, i) => {
    const title = (r.title ?? "").trim().slice(0, 64);
    const company = (r.company ?? "").trim().slice(0, 40);
    const head = company ? `${title} @ ${company}` : title;
    const pay = shortPay(r.pay);
    const loc = shortLocation(r.location);
    const tail = [pay, loc].filter(Boolean).join(" | ");
    return `${numberEmojis[i] ?? `${i + 1}.`} ${head}${tail ? ` — ${tail}` : ""}`;
  });

  const name = firstName(cand.name);
  const cityLabel = usedCity && city ? city : "your area";
  const dashboardUrl = `${publicWebOrigin()}/auth?phone=1`;
  const channel = preferredChannel();

  const body =
    `Hey ${name}! 👋 It's Sarah from GigGrab.\n\n` +
    `Really great speaking with you just now! As promised I've gone ahead and found your top ${rows.length} matches in ${cityLabel} 👇\n\n` +
    `${lines.join("\n")}\n\n` +
    `Any of these catch your eye? Just reply with the number and I'll get you more details straight away 😊\n\n` +
    `Or to see more opportunities tap here 👉 ${dashboardUrl} — sign in with your number.`;

  const res = await sendSms({ to: cand.phone, body, channel });
  if (!res) return { ok: false, reason: "twilio send failed", count: rows.length };
  return { ok: true, sid: res.sid, channel: res.channel, count: rows.length };
}
