// Wire types — match server response shapes from /api/sessions/:id/profile.
// Mirrors @gig-grab/db schema (kept manual to avoid pulling DB deps into the
// client bundle).

export type ProfileProject = {
  role: string;
  company: string;
  period: string;
  description?: string;
};

export type ProfileCard = {
  candidateId: string;
  name: string;
  title: string;
  yearsExperience: number;
  location: string;
  summary: string;
  ticketsAndCards: string[];
  recentProjects: ProfileProject[];
  updatedAt: string;
};

export type TranscriptTurn = {
  id: string;
  sessionId: string;
  ord: number;
  speaker: "candidate" | "employer" | "ai";
  text: string;
  msOffset: number;
  timestamp: string;
};

export type CandidateLite = {
  id: string;
  phone: string;
  language: string;
  email?: string;
};

export type SessionLite = {
  id: string;
  status: "ringing" | "in_progress" | "completed" | "abandoned" | "failed";
  startedAt: string;
  endedAt: string | null;
};

export type ProfileResponse = {
  candidate: CandidateLite;
  session: SessionLite;
  transcript: TranscriptTurn[];
  profile: ProfileCard | null;
};

export type Match = {
  id: string;
  jobTitle: string;
  employer: string;
  detail: string;
  pay: string;
  matchPct: number;
  whyRanked: string;
};
