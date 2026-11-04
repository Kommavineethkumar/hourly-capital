import { desc, eq } from "drizzle-orm";
import { ensureStorage, getDb } from "../../../db";
import { backlogItems, type NewBacklogItem } from "../../../db/schema";
const categories = new Set(["Learning", "Artifact Creation", "Opportunity Development", "Automation & Leverage", "Work & Domain Depth", "Reflection & Optimization"]);
const energies = new Set(["Low", "Medium", "High"]);

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  await ensureStorage();
  const items = await getDb().select().from(backlogItems).where(eq(backlogItems.status, "open")).orderBy(desc(backlogItems.createdAt));
  return Response.json({ items });
}

export async function POST(request: Request) {
  await ensureStorage();
  const payload = (await request.json()) as Partial<NewBacklogItem>;
  const title = clean(payload.title);
  const category = clean(payload.category, 80);
  if (!title || !category) return Response.json({ error: "Title and category are required." }, { status: 400 });
  const energy = clean(payload.energy, 20) || "Medium";
  if (!categories.has(category) || !energies.has(energy) || (payload.minutes != null && !Number.isInteger(payload.minutes))) return Response.json({ error: "Category, energy, or duration is invalid." }, { status: 400 });
  const [item] = await getDb().insert(backlogItems).values({
    id: crypto.randomUUID(),
    title,
    category,
    energy,
    minutes: typeof payload.minutes === "number" ? Math.max(15, Math.min(240, payload.minutes)) : 60,
    expectedOutput: clean(payload.expectedOutput),
    createdAt: new Date().toISOString(),
  }).returning();
  return Response.json({ item }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureStorage();
  const payload = (await request.json()) as { id?: string; status?: string; title?: string; category?: string; energy?: string; minutes?: number; expectedOutput?: string };
  if (!payload.id) return Response.json({ error: "Item id is required." }, { status: 400 });
  if (payload.status && payload.status !== "open" && payload.status !== "done") return Response.json({ error: "Status must be open or done." }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (payload.status) updates.status = payload.status;
  if (payload.title !== undefined) {
    const cleaned = clean(payload.title);
    if (!cleaned) return Response.json({ error: "Title cannot be empty." }, { status: 400 });
    updates.title = cleaned;
  }
  if (payload.category !== undefined) {
    const cleaned = clean(payload.category, 80);
    if (!cleaned || !categories.has(cleaned)) return Response.json({ error: "Category is invalid." }, { status: 400 });
    updates.category = cleaned;
  }
  if (payload.energy !== undefined) {
    const cleaned = clean(payload.energy, 20);
    if (!cleaned || !energies.has(cleaned)) return Response.json({ error: "Energy is invalid." }, { status: 400 });
    updates.energy = cleaned;
  }
  if (payload.minutes !== undefined) {
    if (!Number.isInteger(payload.minutes)) return Response.json({ error: "Minutes must be an integer." }, { status: 400 });
    updates.minutes = Math.max(15, Math.min(240, payload.minutes));
  }
  if (payload.expectedOutput !== undefined) {
    updates.expectedOutput = clean(payload.expectedOutput);
  }

  if (!Object.keys(updates).length) return Response.json({ error: "No fields to update." }, { status: 400 });
  const [item] = await getDb().update(backlogItems).set(updates).where(eq(backlogItems.id, payload.id)).returning();
  if (!item) return Response.json({ error: "Item not found." }, { status: 404 });
  return Response.json({ item });
}

export async function DELETE(request: Request) {
  await ensureStorage();
  const payload = (await request.json()) as { id?: string };
  const id = clean(payload.id, 100);
  if (!id) return Response.json({ error: "Item id is required." }, { status: 400 });
  const [item] = await getDb().delete(backlogItems).where(eq(backlogItems.id, id)).returning();
  if (!item) return Response.json({ error: "Item not found." }, { status: 404 });
  return Response.json({ item });
}
