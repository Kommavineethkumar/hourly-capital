import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished Capital product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Capital — Make the next hour count<\/title>/i);
  assert.match(html, /What deserves this hour\?/);
  assert.match(html, /Career capital/);
  assert.match(html, /Today’s timeline/);
  assert.match(html, /Signals, not scores/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships the durable hour loop and bespoke social card", async () => {
  const [page, route, backlogRoute, schema, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/hours/route.ts", root), "utf8"),
    readFile(new URL("app/api/backlog/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    access(new URL("public/og.png", root)),
  ]);

  assert.match(page, /Cmd|⌘/);
  assert.match(page, /Agent work/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.doesNotMatch(route, /Notion|notion/);
  assert.match(backlogRoute, /export async function GET/);
  assert.match(backlogRoute, /export async function POST/);
  assert.match(backlogRoute, /export async function PATCH/);
  assert.match(schema, /idx_hours_date_start/);
  assert.match(schema, /idx_backlog_status_created/);
  assert.match(layout, /\/og\.png/);
  assert.match(page, /Find what compounds/);
  assert.match(page, /Opportunity backlog/);
  assert.match(page, /Export CSV/);
  assert.match(page, /Remove .* from timeline/);
});

test("ships the Codex task queue, runner, and bounded context adapters", async () => {
  const [tasksView, tasksRoute, runner, contextCollector, schema] = await Promise.all([
    readFile(new URL("app/components/tasks-view.tsx", root), "utf8"),
    readFile(new URL("app/api/tasks/route.ts", root), "utf8"),
    readFile(new URL("scripts/capital-runner.mjs", root), "utf8"),
    readFile(new URL("scripts/lib/context-collector.mjs", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(tasksView, /Put useful work in motion/);
  assert.match(tasksView, /codex:\/\/threads\//);
  assert.match(tasksRoute, /export async function GET/);
  assert.match(tasksRoute, /export async function POST/);
  assert.match(tasksRoute, /export async function PATCH/);
  assert.match(tasksRoute, /export async function DELETE/);
  assert.match(runner, /thread\/start/);
  assert.match(runner, /turn\/start/);
  assert.match(runner, /gpt-5\.6-sol/);
  assert.match(contextCollector, /collectRelevantContext/);
  assert.match(contextCollector, /Claude/);
  assert.match(contextCollector, /Codex/);
  assert.match(contextCollector, /Pi/);
  assert.match(contextCollector, /Hermes/);
  assert.match(schema, /codex_tasks/);
});
