import { desc, eq } from "drizzle-orm";
import { ensureStorage, getDb } from "../../../db";
import { hours, type NewHour } from "../../../db/schema";

type HourPayload = Partial<NewHour> & { id?: string };

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return message.includes("no such table")
    ? "Storage is not initialized yet. Apply the generated database migration and retry."
    : message;
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
    return Response.json({ hour });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
