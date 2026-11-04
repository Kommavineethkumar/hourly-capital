#!/usr/bin/env node

import { spawn } from "node:child_process";
import os, { userInfo } from "node:os";
import { access, stat } from "node:fs/promises";
import { collectRelevantContext } from "./lib/context-collector.mjs";

const DEFAULT_API_URL = process.env.CAPITAL_URL || "https://hourly-capital.vineethkumar-k-14679.chatgpt.site";
const DEFAULT_CWD = process.env.CAPITAL_PROJECTS_DIR || os.homedir();
const KEYCHAIN_SERVICE = "Capital Runner";
const DEFAULT_INTERVAL_SECONDS = 5;
const MAX_STATUS_LENGTH = 4_000;

function usage() {
  return [
    "Usage: node scripts/capital-runner.mjs [--once | --watch] [options]",
    "",
    "Options:",
    "  --once                 Check once, run at most one queued task, then exit (default)",
    "  --watch                Keep polling and process queued tasks one at a time",
    "  --api-url <url>        Capital site URL",
    "  --interval <seconds>   Watch polling interval (default: 5)",
    "  --task-id <id>         Only process this queued task",
    "  --help                 Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    mode: "once",
    apiUrl: DEFAULT_API_URL,
    intervalMs: DEFAULT_INTERVAL_SECONDS * 1_000,
    taskId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      options.help = true;
    } else if (argument === "--once") {
      options.mode = "once";
    } else if (argument === "--watch") {
      options.mode = "watch";
    } else if (argument === "--api-url") {
      options.apiUrl = requiredValue(argv, ++index, argument);
    } else if (argument === "--interval") {
      const seconds = Number(requiredValue(argv, ++index, argument));
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--interval must be greater than zero.");
      options.intervalMs = seconds * 1_000;
    } else if (argument === "--task-id") {
      options.taskId = requiredValue(argv, ++index, argument);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  const apiUrl = new URL(options.apiUrl);
  if (apiUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(apiUrl.hostname)) throw new Error("--api-url must use HTTPS (the token is sent with every request).");
  options.apiUrl = apiUrl.href.replace(/\/$/, "");
  return options;
}

function requiredValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4_096) stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${command} exited with status ${code}.`));
    });
  });
}

async function readRunnerToken() {
  const account = userInfo().username;
  try {
    const token = await runCommand("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
    ]);
    if (!token) throw new Error("Credential is empty.");
    return token;
  } catch {
    throw new Error(`Capital Runner credential is unavailable in macOS Keychain for account ${account}.`);
  }
}

class CapitalApi {
  constructor(baseUrl, token) {
    this.tasksUrl = new URL("/api/tasks", `${baseUrl}/`);
    this.token = token;
  }

  async request(method, body) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(this.tasksUrl, {
          method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Capital-Token": this.token,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) return payload;
        const detail = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
        lastError = new Error(`Capital API request failed: ${detail}`);
        if (response.status < 500 || attempt === 3) throw lastError;
      } catch (error) {
        lastError = error;
        if (attempt === 3) throw error;
      }
      await delay(attempt * 750);
    }
    throw lastError;
  }

  async nextQueued(taskId) {
    const payload = await this.request("GET");
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    return tasks
      .filter((task) => task?.status === "queued" && (!taskId || task.id === taskId))
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))[0] ?? null;
  }

  async update(id, status, fields = {}) {
    return this.request("PATCH", { id, status, ...fields });
  }
}

class CodexAppServer {
  constructor() {
    this.child = null;
    this.buffer = "";
    this.nextRequestId = 1;
    this.pending = new Map();
    this.notificationListeners = new Set();
    this.stderr = "";
  }

  async start() {
    this.child = spawn("codex", ["app-server"], { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.consume(chunk));
    this.child.stderr.on("data", (chunk) => {
      if (this.stderr.length < 8_192) this.stderr += chunk;
    });
    this.child.once("error", (error) => this.rejectPending(error));
    this.child.once("close", (code) => {
      const message = this.stderr.trim() || `Codex app-server exited with status ${code}.`;
      this.rejectPending(new Error(message));
    });

    await this.request("initialize", {
      clientInfo: { name: "capital_runner", title: "Capital Runner", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  consume(chunk) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        try {
          this.route(JSON.parse(line));
        } catch {
          // Ignore non-protocol output; request timeouts and process exit remain authoritative.
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  route(message) {
    if (Object.hasOwn(message, "id") && !message.method) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || "Codex app-server request failed."));
      else pending.resolve(message.result);
      return;
    }
    for (const listener of this.notificationListeners) listener(message);
  }

  request(method, params, timeoutMs = 30_000) {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`Codex app-server timed out waiting for ${method}.`));
      }, timeoutMs);
      this.pending.set(String(id), { resolve, reject, timer });
      this.send({ method, id, params });
    });
  }

  notify(method, params) {
    this.send({ method, params });
  }

  send(message) {
    if (!this.child?.stdin.writable) throw new Error("Codex app-server is not writable.");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  onMessage(listener) {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  close() {
    if (!this.child || this.child.killed) return;
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }
}

// Security: task paths come from the website, so a task may only work inside
// CAPITAL_PROJECTS_DIR (default $HOME). Anything else falls back to that root.
async function usableProjectPath(value) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_CWD;
  const { realpath } = await import("node:fs/promises");
  const root = await realpath(DEFAULT_CWD);
  try {
    const candidate = await realpath(value.trim());
    if (candidate !== root && !candidate.startsWith(root + "/")) return DEFAULT_CWD;
    await access(candidate);
    if ((await stat(candidate)).isDirectory()) return candidate;
  } catch {
    // Fall back to the known projects root when the task points at a missing path.
  }
  return DEFAULT_CWD;
}

function optionalCollectedContext(task) {
  const candidates = [task.collectedContext, task.contextSummary, task.relevantContext, task.priorContext];
  const context = candidates.find((value) => typeof value === "string" && value.trim());
  return context ? context.trim().slice(0, 24_000) : "No context was pre-collected for this task.";
}

function buildPrompt(task, cwd) {
  const instructions = typeof task.instructions === "string" && task.instructions.trim()
    ? task.instructions.trim()
    : "Complete the task described by the title.";
  const priorContext = task.usePriorContext
    ? [
        "Use only relevant prior-session context. Check Codex tasks and memory, Claude Code history, Pi observations or sessions, and Hermes history or outputs when useful. Search narrowly and do not ingest entire archives.",
        "Relevant context already collected by Capital:",
        optionalCollectedContext(task),
      ].join("\n")
    : "Do not retrieve prior-session context unless it is required to understand the task.";
  const browserInstruction = task.useAside
    ? "Use the Aside Browser skill for relevant authenticated webpages or browser-only data. Do not request credentials or reproduce secrets in your response."
    : "Do not use authenticated browser sessions unless the task cannot be completed without them.";

  return [
    "You are working on a task queued from Capital. Complete it autonomously in this separate persistent Codex task.",
    `Task: ${String(task.title || "Untitled task").trim()}`,
    "Instructions:",
    instructions,
    `Working directory: ${cwd}`,
    priorContext,
    browserInstruction,
    "Keep the Capital task status high-level. If essential user direction is missing, use request_user_input so Capital can mark the task as needing input. Otherwise work through verification and finish with a concise result summary.",
  ].join("\n\n");
}

function shortMessage(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, MAX_STATUS_LENGTH);
}

function userInputSummary(params) {
  const questions = Array.isArray(params?.questions) ? params.questions : [];
  return shortMessage(
    questions.map((question) => question?.question).filter(Boolean).join(" "),
    "Codex needs input before it can continue.",
  );
}

function finalAgentMessage(turn, streamedMessages) {
  const items = Array.isArray(turn?.items) ? turn.items : [];
  const messages = [...streamedMessages, ...items.filter((item) => item?.type === "agentMessage")];
  return messages.findLast((item) => item?.phase === "final_answer")?.text
    || messages.findLast((item) => typeof item?.text === "string" && item.text.trim())?.text
    || "Codex completed the task.";
}

// Security: the website can request these, but only the Mac owner can allow them.
const ALLOW_CONTEXT = process.env.CAPITAL_ALLOW_CONTEXT === "1";
const ALLOW_ASIDE = process.env.CAPITAL_ALLOW_ASIDE === "1";

async function runCodexTask(rawTask, api) {
  const task = { ...rawTask, usePriorContext: rawTask.usePriorContext && ALLOW_CONTEXT, useAside: rawTask.useAside && ALLOW_ASIDE };
  const cwd = await usableProjectPath(task.projectPath);
  const collectedContext = task.usePriorContext
    ? await collectRelevantContext({ ...task, cwd }, { maxChars: 12_000 })
    : "";
  const taskWithContext = { ...task, collectedContext };
  const server = new CodexAppServer();
  let threadId = null;
  let turnId = null;
  let terminal = false;
  const agentMessages = [];

  try {
    const resumeMessage = typeof task.resumeMessage === "string" ? task.resumeMessage.trim() : "";
    const continuing = Boolean(resumeMessage && task.codexThreadId);
    await api.update(task.id, "running", { statusMessage: continuing ? "Continuing the existing Codex session." : "Starting a new Codex session." });
    await server.start();
    const sessionOptions = { model: process.env.CAPITAL_CODEX_MODEL || "gpt-6-luna", cwd, approvalPolicy: "never", sandbox: "workspace-write", serviceTier: "priority" };
    if (continuing) {
      // Continue: reuse the same thread so Codex keeps its full prior conversation.
      const resumed = await server.request("thread/resume", { threadId: task.codexThreadId, ...sessionOptions });
      threadId = resumed?.thread?.id;
      if (threadId !== task.codexThreadId) throw new Error("Codex could not resume the previous session.");
    } else {
      const threadResult = await server.request("thread/start", { ...sessionOptions, serviceName: "capital_runner", ephemeral: false });
      threadId = threadResult?.thread?.id;
      if (!threadId) throw new Error("Codex did not return a thread id.");
      await server.request("thread/name/set", { threadId, name: String(task.title).trim().slice(0, 240) });
    }
    await api.update(task.id, "running", {
      codexThreadId: threadId,
      resumeMessage: "",
      statusMessage: continuing ? "Codex is continuing the same session." : "Codex is working in a new session.",
    });

    const outcome = new Promise((resolve) => {
      const removeListener = server.onMessage((message) => {
        const params = message?.params;
        if (params?.threadId && params.threadId !== threadId) return;

        if (message.method === "item/completed" && params?.turnId === turnId && params.item?.type === "agentMessage") {
          agentMessages.push(params.item);
        }
        if (message.method === "item/tool/requestUserInput" && params?.turnId === turnId) {
          removeListener();
          resolve({ status: "needs_input", message: userInputSummary(params) });
        }
        if (message.method === "turn/completed" && params?.turn?.id === turnId) {
          removeListener();
          const turn = params.turn;
          if (turn.status === "completed") resolve({ status: "completed", message: finalAgentMessage(turn, agentMessages) });
          else if (turn.status === "interrupted") resolve({ status: "failed", message: "Codex was interrupted before completing the task." });
          else resolve({ status: "failed", message: turn.error?.message || "Codex could not complete the task." });
        }
      });
    });

    const turnResult = await server.request("turn/start", {
      threadId,
      input: [{ type: "text", text: continuing ? resumeMessage : buildPrompt(taskWithContext, cwd) }],
      cwd,
      approvalPolicy: "never",
      sandboxPolicy: { type: "workspaceWrite", writableRoots: [cwd], networkAccess: true },
      model: process.env.CAPITAL_CODEX_MODEL || "gpt-6-luna",
      effort: "medium",
      serviceTier: "priority",
      summary: "concise",
    });
    turnId = turnResult?.turn?.id;
    if (!turnId) throw new Error("Codex did not return a turn id.");

    const result = await outcome;
    terminal = true;
    await api.update(task.id, result.status, {
      codexThreadId: threadId,
      statusMessage: shortMessage(result.message, result.status === "completed" ? "Completed." : "Needs attention."),
    });
    return result.status;
  } catch (error) {
    const message = shortMessage(error instanceof Error ? error.message : "Capital Runner failed.", "Capital Runner failed.");
    if (!terminal) {
      try {
        await api.update(task.id, "failed", { codexThreadId: threadId, statusMessage: message });
      } catch {
        // Preserve the original failure while avoiding credential or response-body logging.
      }
    }
    throw new Error(message);
  } finally {
    server.close();
  }
}

function delay(milliseconds, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const token = await readRunnerToken();
  const api = new CapitalApi(options.apiUrl, token);
  const shutdown = new AbortController();
  process.once("SIGINT", () => shutdown.abort());
  process.once("SIGTERM", () => shutdown.abort());

  do {
    const task = await api.nextQueued(options.taskId);
    if (task) {
      console.log(`Starting Capital task: ${task.title}`);
      try {
        const status = await runCodexTask(task, api);
        console.log(`Capital task ${status}: ${task.title}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Capital Runner failed.");
      }
    }
    if (options.mode !== "watch" || shutdown.signal.aborted) break;
    await delay(task ? 0 : options.intervalMs, shutdown.signal);
  } while (!shutdown.signal.aborted);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Capital Runner failed.");
  process.exitCode = 1;
});
