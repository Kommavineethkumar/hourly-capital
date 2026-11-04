import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { apiTokens } from "../db/schema";

export const TOKEN_HEADER = "x-capital-token";

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Resolves the caller. Signed-in browsers get the Sites identity header; a user's own
// runner/backup script sends a personal token in `X-Capital-Token`. Local dev is one user.
export async function currentUserId(request: Request): Promise<string | null> {
  const siteUser = request.headers.get("oai-authenticated-user-id");
  if (siteUser) return siteUser;
  const token = request.headers.get(TOKEN_HEADER);
  if (token) {
    const db = getDb();
    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, await sha256(token))).limit(1);
    if (!row) return null;
    await db.update(apiTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiTokens.id, row.id));
    return row.userId;
  }
  const { hostname } = new URL(request.url);
  return hostname === "localhost" || hostname === "127.0.0.1" ? "local-dev" : null;
}

export const unauthorized = () => Response.json({ error: "Sign in to use Capital." }, { status: 401 });
