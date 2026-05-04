import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let cached: ReturnType<typeof createClient> | null = null;

/**
 * Create a postgres-js client. Handles two connection styles:
 *
 * 1. Standard TCP URL — `postgres://user:pass@host:port/db`
 *    (used in local dev via Cloud SQL Auth Proxy on 127.0.0.1:5433)
 *
 * 2. Cloud SQL unix-socket — `postgres://user:pass@/db?host=/cloudsql/CONN`
 *    (used by Cloud Functions / Cloud Run with --add-cloudsql-instances).
 *    postgres-js v3 fails `new URL()` on empty hostname, so we parse the
 *    string ourselves and pass an options object.
 */
function createClient(databaseUrl: string) {
  const isUnixSocket = /:\/\/[^/]*@\/[^?]+\?host=\/cloudsql\//.test(databaseUrl);

  let client: ReturnType<typeof postgres>;

  if (isUnixSocket) {
    // postgres://user:pass@/db?host=/cloudsql/PROJECT:REGION:INSTANCE
    const m = databaseUrl.match(
      /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@\/([^?]+)\?host=(.+)$/,
    );
    if (!m) {
      throw new Error("Could not parse Cloud SQL unix-socket DATABASE_URL.");
    }
    const [, user, password, database, host] = m;
    client = postgres({
      host: decodeURIComponent(host),
      database,
      username: user,
      password: decodeURIComponent(password),
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  } else {
    client = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }

  return drizzle(client, { schema, casing: "snake_case" });
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
