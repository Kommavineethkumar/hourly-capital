import { execFile } from "node:child_process";
import { access, open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HOME = os.homedir();
const DEFAULT_MAX_CHARS = 12_000;
const MAX_SOURCE_CHARS = 3_000;
const MAX_EXCERPT_CHARS = 800;
const MAX_CANDIDATES_PER_SOURCE = 2;
const SOURCE_TIMEOUT_MS = 1_800;
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "any", "are", "can", "for",
  "from", "have", "into", "its", "just", "need", "that", "the", "then",
  "this", "want", "will", "with", "work", "would", "you", "your",
]);

function taskText(task) {
  if (typeof task === "string") return task;
  if (!task || typeof task !== "object") return "";
  return [
    task.title,
    task.description,
    task.details,
    task.context,
    task.cwd,
    task.projectPath,
    task.repository,
  ].filter((value) => typeof value === "string").join(" ");
}

function keywordsFor(text) {
  return [...new Set(
    text.toLowerCase().match(/[a-z0-9_./:@-]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  )].slice(0, 24);
}

function stripUrlSecrets(value) {
  return value.replace(/https?:\/\/[^\s<>'"`]+/gi, (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return rawUrl.split(/[?#]/, 1)[0];
    }
  });
}

function stripControlCharacters(value) {
  return [...value].map((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && character !== "\n" && character !== "\r" && character !== "\t") || code === 127
      ? " "
      : character;
  }).join("");
}

function sanitize(value) {
  if (typeof value !== "string") return "";
  let text = stripUrlSecrets(stripControlCharacters(value))
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi, "[REDACTED PRIVATE MATERIAL]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED TOKEN]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_\-.]{8,}/gi, "$1 [REDACTED]")
    .replace(/\b(authorization|cookie|set-cookie|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?(?:id|token))\b\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs]|AKIA)[-_A-Za-z0-9]{12,}\b/g, "[REDACTED TOKEN]")
    .replace(/\b[A-Fa-f0-9]{48,}\b/g, "[REDACTED HIGH-ENTROPY VALUE]")
    .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, "[REDACTED HIGH-ENTROPY VALUE]")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b(private[_ -]?key|client[_ -]?secret|credentials?)\b/i.test(text)) {
    text = text.replace(/.{0,80}\b(private[_ -]?key|client[_ -]?secret|credentials?)\b.{0,160}/gi, " [REDACTED SENSITIVE CONTEXT] ");
  }
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_EXCERPT_CHARS);
}

function timestampMs(value) {
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1_000 : value;
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreCandidate(candidate, keywords, task) {
  const haystack = `${candidate.title ?? ""} ${candidate.text ?? ""} ${candidate.project ?? ""}`.toLowerCase();
  const matches = keywords.filter((keyword) => haystack.includes(keyword)).length;
  const lexical = keywords.length ? matches / Math.min(keywords.length, 8) : 0;
  const taskProject = `${task?.cwd ?? ""} ${task?.projectPath ?? ""} ${task?.repository ?? ""}`.toLowerCase();
  const project = taskProject && candidate.project
    ? taskProject.includes(String(candidate.project).toLowerCase()) || String(candidate.project).toLowerCase().includes(taskProject.trim())
    : false;
  const ageDays = Math.max(0, (Date.now() - timestampMs(candidate.timestamp)) / 86_400_000);
  const recency = Math.exp(-ageDays / 30);
  return lexical * 0.65 + (project ? 0.2 : 0) + recency * 0.15;
}

function rank(candidates, keywords, task) {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, keywords, task) }))
    .filter((candidate) => candidate.score >= (keywords.length ? 0.12 : 0.1))
    .sort((a, b) => b.score - a.score || timestampMs(b.timestamp) - timestampMs(a.timestamp))
    .slice(0, MAX_CANDIDATES_PER_SOURCE);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTail(filePath, maxBytes = 2_000_000) {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const text = buffer.toString("utf8");
    return size > length ? text.slice(text.indexOf("\n") + 1) : text;
  } finally {
    await handle.close();
  }
}

function parseJsonLines(text, maxRecords = 500) {
  return text.split("\n").slice(-maxRecords).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

async function sqliteJson(databasePath, sql) {
  if (!(await exists(databasePath))) return [];
  const uri = `file:${databasePath}?mode=ro`;
  const { stdout } = await execFileAsync("sqlite3", ["-json", uri, sql], {
    timeout: SOURCE_TIMEOUT_MS,
    maxBuffer: 2_000_000,
  });
  if (!stdout.trim()) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function collectClaude(keywords, task) {
  const historyPath = path.join(HOME, ".claude", "history.jsonl");
  if (!(await exists(historyPath))) return [];
  const records = parseJsonLines(await readTail(historyPath), 600);
  return rank(records.map((record) => ({
    id: record.sessionId,
    title: record.display,
    text: record.display,
    project: record.project,
    timestamp: record.timestamp,
  })), keywords, task);
}

async function collectCodex(keywords, task) {
  const databasePath = path.join(HOME, ".codex", "state_5.sqlite");
  const rows = await sqliteJson(databasePath, `
    SELECT id, title, first_user_message AS text, preview, cwd AS project,
           COALESCE(recency_at_ms, updated_at_ms, updated_at * 1000, created_at * 1000) AS timestamp
    FROM threads
    WHERE has_user_event = 1
    ORDER BY COALESCE(recency_at_ms, updated_at_ms, updated_at * 1000, created_at * 1000) DESC
    LIMIT 160;
  `);
  return rank(rows.map((row) => ({
    ...row,
    text: [row.text, row.preview].filter(Boolean).join(" — "),
  })), keywords, task);
}

async function collectPi(keywords, task) {
  const databasePath = path.join(HOME, ".pi", "memory", "memory.db");
  const rows = await sqliteJson(databasePath, `
    SELECT key AS id, key AS title, value AS text, source AS project,
           COALESCE(updated_at, created_at) AS timestamp
    FROM semantic
    UNION ALL
    SELECT id, category AS title, rule AS text, COALESCE(project, source) AS project, created_at AS timestamp
    FROM lessons
    WHERE is_deleted = 0
    ORDER BY timestamp DESC
    LIMIT 180;
  `);
  return rank(rows, keywords, task);
}

async function collectHermes(keywords, task) {
  const databasePath = path.join(HOME, ".hermes", "state.db");
  const rows = await sqliteJson(databasePath, `
    SELECT id, COALESCE(title, display_name, last_activity_description) AS title,
           last_activity_description AS text,
           COALESCE(git_repo_root, cwd) AS project,
           COALESCE(last_activity_at, ended_at, started_at) * 1000 AS timestamp
    FROM sessions
    WHERE archived = 0 OR archived IS NULL
    ORDER BY COALESCE(last_activity_at, ended_at, started_at) DESC
    LIMIT 120;
  `);
  return rank(rows, keywords, task);
}

function formatSource(label, candidates, limit) {
  if (!candidates.length || limit <= 0) return "";
  const lines = [`[${label}]`];
  for (const candidate of candidates) {
    const title = sanitize(candidate.title) || "Untitled session";
    const excerpt = sanitize(candidate.text);
    const project = sanitize(candidate.project);
    const date = timestampMs(candidate.timestamp)
      ? new Date(timestampMs(candidate.timestamp)).toISOString().slice(0, 10)
      : "unknown date";
    const metadata = [date, project].filter(Boolean).join(" · ");
    const line = `- ${title}${metadata ? ` (${metadata})` : ""}${excerpt && excerpt !== title ? `: ${excerpt}` : ""}`;
    if ([...lines, line].join("\n").length > limit) break;
    lines.push(line);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

/**
 * Collects a small, sanitized set of relevant context from local agent histories.
 * Missing, busy, or corrupt sources are ignored so they never block task dispatch.
 */
export async function collectRelevantContext(task, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const requestedMaxChars = Number(maxChars);
  const boundedMaxChars = Number.isFinite(requestedMaxChars)
    ? Math.max(0, Math.min(requestedMaxChars, 20_000))
    : DEFAULT_MAX_CHARS;
  if (boundedMaxChars === 0) return "";
  const taskValue = taskText(task);
  const keywords = keywordsFor(taskValue);
  if (!keywords.length) return "";

  const collectors = [
    ["Claude", collectClaude],
    ["Codex", collectCodex],
    ["Pi", collectPi],
    ["Hermes", collectHermes],
  ];
  const settled = await Promise.allSettled(
    collectors.map(([, collector]) => collector(keywords, task)),
  );

  const sections = [];
  let remaining = boundedMaxChars;
  for (let index = 0; index < collectors.length; index += 1) {
    const result = settled[index];
    if (result.status !== "fulfilled") continue;
    const section = formatSource(
      collectors[index][0],
      result.value,
      Math.min(MAX_SOURCE_CHARS, remaining),
    );
    if (!section) continue;
    sections.push(section);
    remaining -= section.length + 2;
    if (remaining <= 0) break;
  }

  if (!sections.length) return "";
  const header = "Potentially relevant prior-session context (sanitized; verify before relying on it):";
  return `${header}\n${sections.join("\n\n")}`.slice(0, boundedMaxChars);
}
