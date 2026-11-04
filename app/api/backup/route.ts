import { eq } from "drizzle-orm";
import { currentUserId, unauthorized } from "../../api-user";
import { ensureStorage, getDb } from "../../../db";
import { backlogItems, codexTasks, hours } from "../../../db/schema";

type Backup = { version?: number; hours?: unknown[]; backlog?: unknown[]; tasks?: unknown[] };

export async function GET(request: Request) {
  try {
    await ensureStorage();
    const userId = await currentUserId(request);
    if (!userId) return unauthorized();
    const db = getDb();
    const [h, b, t] = await Promise.all([
      db.select().from(hours).where(eq(hours.userId, userId)),
      db.select().from(backlogItems).where(eq(backlogItems.userId, userId)),
      db.select().from(codexTasks).where(eq(codexTasks.userId, userId)),
    ]);
    return Response.json({ version: 1, exportedAt: new Date().toISOString(), hours: h, backlog: b, tasks: t });
  } catch {
    return Response.json({ error: "Capital could not build the backup." }, { status: 500 });
  }
}

// Restores a backup into the caller's account. Rows always get the caller's userId;
// ids that already exist (anyone's) are skipped, so restoring twice is safe and can't overwrite others.
export async function POST(request: Request) {
  let payload: Backup;
  try {
    payload = (await request.json()) as Backup;
  } catch {
    return Response.json({ error: "Backup file is not valid JSON." }, { status: 400 });
  }
  if (payload.version !== 1) return Response.json({ error: "Unsupported backup version." }, { status: 400 });
  const valid = (rows: unknown) =>
    (Array.isArray(rows) ? rows : []).filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string");
  try {
    await ensureStorage();
    const userId = await currentUserId(request);
    if (!userId) return unauthorized();
    const db = getDb();
    const counts = { hours: 0, backlog: 0, tasks: 0 };
    for (const row of valid(payload.hours)) counts.hours += (await db.insert(hours).values({ ...(row as typeof hours.$inferInsert), userId }).onConflictDoNothing().returning()).length;
    for (const row of valid(payload.backlog)) counts.backlog += (await db.insert(backlogItems).values({ ...(row as typeof backlogItems.$inferInsert), userId }).onConflictDoNothing().returning()).length;
    for (const row of valid(payload.tasks)) counts.tasks += (await db.insert(codexTasks).values({ ...(row as typeof codexTasks.$inferInsert), userId }).onConflictDoNothing().returning()).length;
    return Response.json({ imported: counts });
  } catch {
    return Response.json({ error: "Backup rows are malformed; rows before the failing one were imported." }, { status: 400 });
  }
}
