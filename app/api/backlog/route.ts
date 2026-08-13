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
  const payload = (await request.json()) as { id?: string; status?: string };
  if (!payload.id) return Response.json({ error: "Item id is required." }, { status: 400 });
  if (payload.status !== "open" && payload.status !== "done") return Response.json({ error: "Status must be open or done." }, { status: 400 });
  const [item] = await getDb().update(backlogItems).set({ status: payload.status }).where(eq(backlogItems.id, payload.id)).returning();
  if (!item) return Response.json({ error: "Item not found." }, { status: 404 });
  return Response.json({ item });
}
