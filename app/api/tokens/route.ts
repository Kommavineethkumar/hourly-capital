import { and, desc, eq } from "drizzle-orm";
import { sha256 } from "../../api-user";
import { ensureStorage, getDb } from "../../../db";
import { apiTokens } from "../../../db/schema";

// Token management requires a real browser sign-in; a token cannot mint more tokens.
function browserUser(request: Request) {
  const { hostname } = new URL(request.url);
  return request.headers.get("oai-authenticated-user-id") ?? (hostname === "localhost" || hostname === "127.0.0.1" ? "local-dev" : null);
}
const denied = () => Response.json({ error: "Sign in to manage runner tokens." }, { status: 401 });

export async function GET(request: Request) {
  await ensureStorage();
  const userId = browserUser(request);
  if (!userId) return denied();
  const tokens = await getDb()
    .select({ id: apiTokens.id, label: apiTokens.label, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens).where(eq(apiTokens.userId, userId)).orderBy(desc(apiTokens.createdAt));
  return Response.json({ tokens });
}

export async function POST(request: Request) {
  await ensureStorage();
  const userId = browserUser(request);
  if (!userId) return denied();
  const body = (await request.json().catch(() => ({}))) as { label?: unknown };
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `cap_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const id = crypto.randomUUID();
  await getDb().insert(apiTokens).values({ id, userId, tokenHash: await sha256(token), label: label || "Capital Runner", createdAt: new Date().toISOString() });
  return Response.json({ id, token }, { status: 201 });
}

export async function DELETE(request: Request) {
  await ensureStorage();
  const userId = browserUser(request);
  if (!userId) return denied();
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string") return Response.json({ error: "Token id is required." }, { status: 400 });
  const [row] = await getDb().delete(apiTokens).where(and(eq(apiTokens.id, body.id), eq(apiTokens.userId, userId))).returning();
  if (!row) return Response.json({ error: "Token not found." }, { status: 404 });
  return Response.json({ ok: true });
}
