// Re-export the Drizzle inferred types as the canonical app-wide types.
// (Schema lives in @gig-grab/db; this package exists for non-DB shared
// types — UI props, wire formats, etc. — added as needed.)
export type {
  Candidate,
  NewCandidate,
  ProfileCard,
  ProfileProject,
  Session,
  TranscriptTurn,
  Employer,
  AtsConnection,
  Job,
  NewJob,
  Match,
  Interview,
  AutoApplyRule,
  Alert,
  CandidateMatchSignals,
} from "@gig-grab/db";

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
