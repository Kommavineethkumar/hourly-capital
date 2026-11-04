import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("every data API resolves the caller and scopes queries by userId", async () => {
  for (const name of ["hours", "backlog", "tasks", "backup"]) {
    const src = await readFile(new URL(`app/api/${name}/route.ts`, root), "utf8");
    const handlers = src.match(/export async function (GET|POST|PATCH|DELETE)\(/g) ?? [];
    const guards = src.match(/const userId = await currentUserId\(request\);\s*if \(!userId\) return unauthorized\(\);/g) ?? [];
    assert.equal(guards.length, handlers.length, `${name}: every handler must resolve the user`);
    // Every by-id write/delete must also match the owner.
    for (const m of src.matchAll(/eq\((\w+)\.id, [\w.]+\)/g)) {
      const line = src.slice(src.lastIndexOf("\n", m.index), src.indexOf("\n", m.index));
      assert.match(line, /userId/, `${name}: id match without user scope: ${line.trim()}`);
    }
  }
});

test("runner and backup authenticate with personal tokens", async () => {
  const [runner, backup, tokens] = await Promise.all(
    ["scripts/capital-runner.mjs", "scripts/backup-capital.mjs", "app/api/tokens/route.ts"].map((f) => readFile(new URL(f, root), "utf8")),
  );
  assert.match(runner, /X-Capital-Token/);
  assert.match(backup, /X-Capital-Token/);
  assert.match(tokens, /tokenHash: await sha256\(token\)/);
  assert.doesNotMatch(tokens, /currentUserId/, "tokens must not be able to mint tokens");
});
