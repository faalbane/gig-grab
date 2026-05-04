// Shared TypeScript types between apps/web, functions, and (via codegen) apps/agent.
// Mirrors the Firestore data model in SPEC.md §3.3.

export type Language =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "hi"
  | "ru"
  | "pt"
  | "ja"
  | "it"
  | "nl"
  | (string & {});

// ==============
// Candidate
// ==============

export type CandidateMatchSignals = {
  trade?: string;
  yearsExperience?: number;
  certs?: string[];
  recentLocations?: string[];
  travelWillingness?: string;
  availability?: string;
  payFloor?: number;
  payCurrency?: "GBP" | "USD" | "EUR" | (string & {});
  shiftPreferences?: string[];
  dealBreakers?: string[];
};

export type Candidate = {
  id: string;
  phone: string;
  language: Language;
  email?: string;
  profileCard?: ProfileCard;
  transcript: TranscriptTurn[];
  cvUrl?: string;
  linkedinId?: string;
  matchSignals: CandidateMatchSignals;
  createdAt: string;
  lastCallAt?: string;
};

export type ProfileCard = {
  name: string;
  title: string;
  yearsExperience: number;
  location: string;
  summary: string;
  ticketsAndCards: string[];
  recentProjects: ProfileProject[];
};

export type ProfileProject = {
  role: string;
  company: string;
  period: string;
  description?: string;
};

// ==============
// Employer + Job
// ==============

export type Employer = {
  id: string;
  email: string;
  company: string;
  calendarId?: string;
  atsConnection?: AtsConnection;
  jobs: string[];
  createdAt: string;
};

export type AtsProvider = "greenhouse" | "workable" | "ashby" | "bamboohr";

export type AtsConnection = {
  provider: AtsProvider;
  accountId: string;
  connectedAt: string;
  lastSyncAt?: string;
};

export type JobSource = "voice" | "upload" | "link" | "ats";

export type JobStatus = "active" | "interviewing" | "paused" | "filled";

export type Job = {
  id: string;
  employerId: string;
  title: string;
  location: string;
  pay: string;
  shiftPattern?: string;
  mustHaves: string[];
  dealBreakers: string[];
  source: JobSource;
  status: JobStatus;
  embedding?: number[];
  requiredCount: number;
  createdAt: string;
  updatedAt: string;
};

// ==============
// Match + Interview
// ==============

export type MatchStatus =
  | "suggested"
  | "applied"
  | "screened"
  | "shortlisted"
  | "rejected";

export type Match = {
  id: string;
  candidateId: string;
  jobId: string;
  score: number; // 0..1
  whyRanked: string;
  status: MatchStatus;
  interviewId?: string;
  createdAt: string;
};

export type InterviewType = "ai" | "human";

export type Interview = {
  id: string;
  candidateId: string;
  jobId: string;
  type: InterviewType;
  slot: string;
  calendarEventId?: string;
  transcript?: TranscriptTurn[];
  createdAt: string;
};

export type TranscriptTurn = {
  speaker: "candidate" | "employer" | "ai";
  text: string;
  timestamp: string;
};
