import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cached: ReturnType<typeof createClient> | null = null;

function createClient(databaseUrl: string) {
  // Single connection in serverless contexts (Cloud Functions, Neon).
  // For long-running processes (the Pipecat agent server) we'd raise `max`.
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required for connection poolers (PgBouncer/Neon proxy)
  });
  return drizzle(sql, { schema, casing: "snake_case" });
}

/**
 * Get a Drizzle client. Caches per-process so serverless invocations reuse
 * the connection across warm starts.
 */
export function db() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. See .env.example — provision Cloud SQL via infra/cloudsql-setup.sh, or run docker-compose for local dev.",
    );
  }
  cached = createClient(url);
  return cached;
}

export type Db = ReturnType<typeof db>;
