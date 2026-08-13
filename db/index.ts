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

export async function ensureStorage() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS hours (
      id TEXT PRIMARY KEY NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      intention TEXT NOT NULL,
      expected_output TEXT DEFAULT '' NOT NULL,
      actual_activity TEXT DEFAULT '' NOT NULL,
      output TEXT DEFAULT '' NOT NULL,
      category TEXT NOT NULL,
      score INTEGER,
      focus INTEGER,
      energy TEXT,
      interruptions INTEGER DEFAULT 0 NOT NULL,
      notes TEXT DEFAULT '' NOT NULL,
      follow_up TEXT DEFAULT '' NOT NULL,
      work_mode TEXT DEFAULT 'human' NOT NULL,
      status TEXT DEFAULT 'planned' NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hours_date_start ON hours (date, start_time)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_hours_status ON hours (status)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS backlog_items (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      energy TEXT DEFAULT 'Medium' NOT NULL,
      minutes INTEGER DEFAULT 60 NOT NULL,
      expected_output TEXT DEFAULT '' NOT NULL,
      status TEXT DEFAULT 'open' NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_backlog_status_created ON backlog_items (status, created_at)"),
    d1.prepare("PRAGMA optimize"),
  ]);
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
