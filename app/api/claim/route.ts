import { eq } from "drizzle-orm";
import { ensureStorage, getDb } from "../../../db";
import { backlogItems, codexTasks, hours } from "../../../db/schema";

// One-time migration helper: rows created before multi-user support have user_id = ''.
// Only OWNER_EMAIL may claim them; afterwards this is a no-op.
const OWNER_EMAIL = "kommavineethkumar@gmail.com";

export async function POST(request: Request) {
  await ensureStorage();
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (!userId || email !== OWNER_EMAIL) return Response.json({ error: "Only the site owner can claim legacy data." }, { status: 403 });
  const db = getDb();
  const [h, b, t] = await Promise.all([
    db.update(hours).set({ userId }).where(eq(hours.userId, "")).returning({ id: hours.id }),
    db.update(backlogItems).set({ userId }).where(eq(backlogItems.userId, "")).returning({ id: backlogItems.id }),
    db.update(codexTasks).set({ userId }).where(eq(codexTasks.userId, "")).returning({ id: codexTasks.id }),
  ]);
  return Response.json({ claimed: { hours: h.length, backlog: b.length, tasks: t.length } });
}
