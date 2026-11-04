import { desc, eq } from "drizzle-orm";
import { ensureStorage, getDb } from "../../../db";
import { codexTasks, type NewCodexTask } from "../../../db/schema";

type TaskPayload = Partial<NewCodexTask> & { id?: string };

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

export async function GET() {
  try {
    await ensureStorage();
    const tasks = await getDb().select().from(codexTasks).orderBy(desc(codexTasks.createdAt)).limit(100);
    return Response.json({ tasks });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureStorage();
    const payload = (await request.json()) as TaskPayload;
    const title = clean(payload.title, 240);
    if (!title) return Response.json({ error: "Task title is required." }, { status: 400 });

    const now = new Date().toISOString();
    const startImmediately = payload.startImmediately === true;
    const value: NewCodexTask = {
      id: crypto.randomUUID(),
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

    const [task] = await getDb()
      .update(codexTasks)
      .set(update)
      .where(eq(codexTasks.id, id))
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
    const payload = (await request.json()) as TaskPayload;
    const id = clean(payload.id, 100);
    if (!id) return Response.json({ error: "Task id is required." }, { status: 400 });

    const [task] = await getDb().delete(codexTasks).where(eq(codexTasks.id, id)).returning();
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
    return Response.json({ task });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
