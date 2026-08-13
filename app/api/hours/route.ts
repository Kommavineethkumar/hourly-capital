import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { ensureStorage, getDb } from "../../../db";
import { hours, type Hour, type NewHour } from "../../../db/schema";

type HourPayload = Partial<NewHour> & { id?: string };
type RuntimeEnv = { NOTION_TOKEN?: string; NOTION_DATA_SOURCE_ID?: string };

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return message.includes("no such table")
    ? "Storage is not initialized yet. Apply the generated database migration and retry."
    : message;
}

async function syncToNotion(hour: Hour) {
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.NOTION_TOKEN || !runtime.NOTION_DATA_SOURCE_ID) return "not_configured";

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11",
    },
    body: JSON.stringify({
      parent: { data_source_id: runtime.NOTION_DATA_SOURCE_ID },
      properties: {
        Activity: { title: [{ text: { content: hour.intention } }] },
        Date: { date: { start: `${hour.date}T${hour.startTime}:00` } },
        Category: { select: { name: hour.category } },
        Status: { select: { name: hour.status === "completed" ? "Complete" : "Planned" } },
        Score: hour.score === null ? { number: null } : { number: hour.score },
        "Work Mode": { select: { name: hour.workMode } },
        Output: { rich_text: [{ text: { content: hour.output.slice(0, 2000) } }] },
      },
    }),
  });

  return response.ok ? "synced" : "failed";
}

export async function GET(request: Request) {
  try {
    await ensureStorage();
    const date = new URL(request.url).searchParams.get("date");
    const db = getDb();
    const rows = date
      ? await db.select().from(hours).where(eq(hours.date, date)).orderBy(desc(hours.startTime))
      : await db.select().from(hours).orderBy(desc(hours.createdAt)).limit(100);
    return Response.json({ hours: rows });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureStorage();
    const payload = (await request.json()) as HourPayload;
    const intention = clean(payload.intention, 500);
    const category = clean(payload.category, 80);
    if (!intention || !category) {
      return Response.json({ error: "Intention and category are required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const value: NewHour = {
      id: crypto.randomUUID(),
      date: clean(payload.date, 10),
      startTime: clean(payload.startTime, 5),
      intention,
      expectedOutput: clean(payload.expectedOutput, 500),
      category,
      workMode: clean(payload.workMode, 20) || "human",
      createdAt: now,
      updatedAt: now,
    };
    if (!value.date || !value.startTime) {
      return Response.json({ error: "Date and start time are required." }, { status: 400 });
    }

    const [hour] = await getDb().insert(hours).values(value).returning();
    return Response.json({ hour }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureStorage();
    const payload = (await request.json()) as HourPayload;
    if (!payload.id) return Response.json({ error: "Hour id is required." }, { status: 400 });

    const now = new Date().toISOString();
    const [hour] = await getDb()
      .update(hours)
      .set({
        endTime: clean(payload.endTime, 5),
        actualActivity: clean(payload.actualActivity, 1000),
        output: clean(payload.output, 2000),
        score: typeof payload.score === "number" ? Math.max(0, Math.min(3, payload.score)) : null,
        focus: typeof payload.focus === "number" ? Math.max(1, Math.min(5, payload.focus)) : null,
        energy: clean(payload.energy, 20) || null,
        interruptions: typeof payload.interruptions === "number" ? Math.max(0, payload.interruptions) : 0,
        notes: clean(payload.notes, 2000),
        followUp: clean(payload.followUp, 1000),
        status: "completed",
        updatedAt: now,
      })
      .where(eq(hours.id, payload.id))
      .returning();

    if (!hour) return Response.json({ error: "Hour not found." }, { status: 404 });
    let notionStatus = "not_configured";
    try {
      notionStatus = await syncToNotion(hour);
    } catch {
      notionStatus = "failed";
    }
    const [saved] = await getDb()
      .update(hours)
      .set({ notionStatus })
      .where(eq(hours.id, hour.id))
      .returning();
    return Response.json({ hour: saved });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
