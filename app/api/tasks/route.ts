import { and, desc, eq } from "drizzle-orm";
import { currentUserId, unauthorized } from "../../api-user";
import { ensureStorage, getDb } from "../../../db";
import { codexTasks, type NewCodexTask } from "../../../db/schema";

type TaskPayload = Partial<NewCodexTask> & { id?: string; freshSession?: boolean };

const statuses = new Set(["inbox", "queued", "running", "needs_input", "completed", "failed", "cancelled"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return message.includes("no such table")
    ? "Task storage is not initialized yet. Apply the generated database migration and retry."
    : "Capital could not complete that task request.";
}

export async function GET(request: Request) {
  try {
    await ensureStorage();
    const userId = await currentUserId(request);
    if (!userId) return unauthorized();
    const params = new URL(request.url).searchParams;
    const limitParam = Number(params.get("limit"));
    const offsetParam = Number(params.get("offset"));
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;
    const offset = Number.isInteger(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
    const tasks = await getDb().select().from(codexTasks).where(eq(codexTasks.userId, userId)).orderBy(desc(codexTasks.createdAt)).limit(limit + 1).offset(offset);
    return Response.json({ tasks: tasks.slice(0, limit), hasMore: tasks.length > limit });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureStorage();
    const userId = await currentUserId(request);
    if (!userId) return unauthorized();
    const payload = (await request.json()) as TaskPayload;
    const title = clean(payload.title, 240);
    if (!title) return Response.json({ error: "Task title is required." }, { status: 400 });

    const now = new Date().toISOString();
    const startImmediately = payload.startImmediately === true;
    const value: NewCodexTask = {
      id: crypto.randomUUID(),
      userId,
      title,
      instructions: clean(payload.instructions, 8_000),
      status: startImmediately ? "queued" : "inbox",
      startImmediately,
      usePriorContext: payload.usePriorContext !== false,
      useAside: payload.useAside === true,
      projectPath: clean(payload.projectPath, 1_000),
      createdAt: now,
      updatedAt: now,
    };

    const [task] = await getDb().insert(codexTasks).values(value).returning();
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureStorage();
    const userId = await currentUserId(request);
    if (!userId) return unauthorized();
    const payload = (await request.json()) as TaskPayload;
    const id = clean(payload.id, 100);
    const status = clean(payload.status, 30);
    if (!id || !statuses.has(status)) return Response.json({ error: "Task id or status is invalid." }, { status: 400 });

    const now = new Date().toISOString();
    const update: Partial<NewCodexTask> = {
      status,
      updatedAt: now,
      ...(status === "running" ? { startedAt: now } : {}),
      ...(status === "queued" ? { completedAt: null } : {}),
      ...(status === "completed" || status === "failed" || status === "cancelled" ? { completedAt: now } : {}),
    };
    if ("codexThreadId" in payload) update.codexThreadId = clean(payload.codexThreadId, 200) || null;
    if ("statusMessage" in payload) update.statusMessage = clean(payload.statusMessage, 4_000);
    if ("resumeMessage" in payload) update.resumeMessage = clean(payload.resumeMessage, 8_000);
    // "Start fresh" explicitly drops the old thread so a new Codex session is intentional.
    if (payload.freshSession === true) { update.codexThreadId = null; update.resumeMessage = ""; }
    if (status === "queued" && update.resumeMessage) {
      const [existing] = await getDb().select({ thread: codexTasks.codexThreadId }).from(codexTasks).where(and(eq(codexTasks.id, id), eq(codexTasks.userId, userId))).limit(1);
      if (!existing?.thread) return Response.json({ error: "This task has no Codex session to continue." }, { status: 400 });
    }

    const [task] = await getDb()
      .update(codexTasks)
      .set(update)
      .where(and(eq(codexTasks.id, id), eq(codexTasks.userId, userId)))
      .returning();

    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
    return Response.json({ task });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureStorage();
    const userId = await currentUserId(request);
    if (!userId) return unauthorized();
    const payload = (await request.json()) as TaskPayload;
    const id = clean(payload.id, 100);
    if (!id) return Response.json({ error: "Task id is required." }, { status: 400 });

    const [task] = await getDb().delete(codexTasks).where(and(eq(codexTasks.id, id), eq(codexTasks.userId, userId))).returning();
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
    return Response.json({ task });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
