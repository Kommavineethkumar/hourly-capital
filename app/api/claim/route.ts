import { eq } from "drizzle-orm";
import { ensureStorage, getDb } from "../../../db";
import { backlogItems, codexTasks, hours } from "../../../db/schema";

// TEMPORARY one-time migration helper: assigns rows created before multi-user support
// (user_id = '') to the caller. Safe only while the Site is owner-private; delete this
// route before the Site goes public.

export async function POST(request: Request) {
  await ensureStorage();
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) return Response.json({ error: "Sign in to claim legacy data." }, { status: 401 });
  const db = getDb();
  const [h, b, t] = await Promise.all([
    db.update(hours).set({ userId }).where(eq(hours.userId, "")).returning({ id: hours.id }),
    db.update(backlogItems).set({ userId }).where(eq(backlogItems.userId, "")).returning({ id: backlogItems.id }),
    db.update(codexTasks).set({ userId }).where(eq(codexTasks.userId, "")).returning({ id: codexTasks.id }),
  ]);
  return Response.json({ claimed: { hours: h.length, backlog: b.length, tasks: t.length } });
}
