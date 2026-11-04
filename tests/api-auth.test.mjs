import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { unauthorized } = await import(new URL("app/api-auth.ts", root).href);

test("rejects unauthenticated remote requests", () => {
  assert.equal(unauthorized(new Request("https://capital.example/api/hours"))?.status, 401);
});

test("allows signed-in users, the runner, and localhost", () => {
  assert.equal(unauthorized(new Request("https://capital.example/api/hours", { headers: { "oai-authenticated-user-id": "u1" } })), null);
  assert.equal(unauthorized(new Request("https://capital.example/api/tasks", { headers: { "OAI-Sites-Authorization": "Bearer x" } })), null);
  assert.equal(unauthorized(new Request("http://localhost:3000/api/hours")), null);
});

test("every API handler is guarded", async () => {
  for (const name of ["hours", "backlog", "tasks", "backup"]) {
    const source = await readFile(new URL(`app/api/${name}/route.ts`, root), "utf8");
    const handlers = source.match(/export async function (GET|POST|PATCH|DELETE)\(/g) ?? [];
    const guards = source.match(/const denied = unauthorized\(request\);/g) ?? [];
    assert.ok(handlers.length > 0, name);
    assert.equal(guards.length, handlers.length, `${name} has unguarded handlers`);
  }
});
