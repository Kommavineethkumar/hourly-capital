import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

function getD1() {
  const runtime = env as unknown as { DB?: D1Database };
  if (!runtime.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return runtime.DB;
}

// Tables are created by drizzle migrations (applied by Sites on deploy, or locally via wrangler).
export async function ensureStorage() {
  getD1();
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
