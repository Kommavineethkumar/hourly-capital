"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TaskStatus = "inbox" | "queued" | "running" | "needs_input" | "completed" | "failed" | "cancelled";

type CodexTask = {
  id: string;
  title: string;
  instructions: string;
  status: TaskStatus;
  startImmediately: boolean;
  usePriorContext: boolean;
  useAside: boolean;
  projectPath: string;
  codexThreadId: string | null;
  statusMessage: string;
  createdAt: string;
};

const statusLabels: Record<TaskStatus, string> = {
  inbox: "Inbox",
  queued: "Queued",
  running: "Running",
  needs_input: "Needs input",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function createdLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function TasksView() {
  const [tasks, setTasks] = useState<CodexTask[]>([]);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [startImmediately, setStartImmediately] = useState(false);
  const [usePriorContext, setUsePriorContext] = useState(true);
  const [useAside, setUseAside] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTasks() {
      try {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        const data = (await response.json()) as { tasks?: CodexTask[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load tasks.");
        if (active) {
          setTasks(data.tasks ?? []);
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load tasks.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadTasks();
    const timer = window.setInterval(() => void loadTasks(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const statusSummary = useMemo(() => {
    if (!tasks.length) return "No tasks";
    const running = tasks.filter((task) => task.status === "running").length;
    const queued = tasks.filter((task) => task.status === "queued").length;
    const completed = tasks.filter((task) => task.status === "completed").length;
    return `${tasks.length} tasks: ${running} running, ${queued} queued, ${completed} completed`;
  }, [tasks]);

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, instructions, projectPath, startImmediately, usePriorContext, useAside }),
      });
      const data = (await response.json()) as { task?: CodexTask; error?: string };
      if (!response.ok || !data.task) throw new Error(data.error || "Could not add the task.");
      const createdTask = data.task;
      setTasks((current) => [createdTask, ...current]);
      setTitle("");
      setInstructions("");
      setProjectPath("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add the task.");
    } finally {
      setCreating(false);
    }
  }

  async function queueTask(task: CodexTask) {
    setBusyId(task.id);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, status: "queued" }),
      });
      const data = (await response.json()) as { task?: CodexTask; error?: string };
      if (!response.ok || !data.task) throw new Error(data.error || "Could not queue the task.");
      const queuedTask = data.task;
      setTasks((current) => current.map((entry) => entry.id === task.id ? queuedTask : entry));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue the task.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeTask(task: CodexTask) {
    const runningNote = task.status === "running" ? " Removing it here will not stop work already running in Codex." : "";
    if (!window.confirm(`Remove “${task.title}”?${runningNote}`)) return;
    setBusyId(task.id);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove the task.");
      setTasks((current) => current.filter((entry) => entry.id !== task.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove the task.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="tasks-page">
      <div className="review-heading">
        <p className="eyebrow">Codex task queue</p>
        <h1>Put useful work in motion.</h1>
        <p>Add a focused task, choose the context Codex may use, and follow its high-level status here.</p>
      </div>

      <form className="task-form card" onSubmit={addTask}>
        <div className="task-fields">
          <label htmlFor="task-title">Task title
            <input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Audit the onboarding flow and fix the highest-impact issue" required />
          </label>
          <label htmlFor="task-project">Project path <span>optional</span>
            <input id="task-project" value={projectPath} onChange={(event) => setProjectPath(event.target.value)} aria-describedby="task-project-help" placeholder="/Users/you/projects/example" />
            <small id="task-project-help">Leave blank to use the runner’s default workspace.</small>
          </label>
        </div>
        <label htmlFor="task-instructions">Instructions <span>optional</span>
          <textarea id="task-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={4} placeholder="Describe the outcome, constraints, and how Codex should verify the work." />
        </label>
        <fieldset className="task-options">
          <legend>Execution preferences</legend>
          <div className="task-option"><input id="task-start-now" type="checkbox" checked={startImmediately} onChange={(event) => setStartImmediately(event.target.checked)} /><label htmlFor="task-start-now"><b>Start now</b><small>Queue this task immediately.</small></label></div>
          <div className="task-option"><input id="task-prior-context" type="checkbox" checked={usePriorContext} onChange={(event) => setUsePriorContext(event.target.checked)} /><label htmlFor="task-prior-context"><b>Use prior context</b><small>Search relevant agent sessions.</small></label></div>
          <div className="task-option"><input id="task-aside" type="checkbox" checked={useAside} onChange={(event) => setUseAside(event.target.checked)} /><label htmlFor="task-aside"><b>Allow Aside</b><small>Use authenticated web research if useful.</small></label></div>
        </fieldset>
        <button className="primary" disabled={creating || !title.trim()}>{creating ? "Adding…" : startImmediately ? "Add & start" : "Add to inbox"}<span>→</span></button>
      </form>

      {error && <div className="task-error" role="alert">{error}</div>}
      <p className="sr-only" aria-live="polite">{statusSummary}</p>

      {loading ? (
        <div className="empty-state">Loading tasks…</div>
      ) : tasks.length ? (
        <ul className="task-list" aria-label="Codex tasks">
          {tasks.map((task) => {
            const busy = busyId === task.id;
            const canQueue = task.status === "inbox" || task.status === "failed" || task.status === "cancelled";
            return (
              <li key={task.id}>
                <article className="task-card card" aria-labelledby={`task-${task.id}`} aria-busy={busy}>
                  <header>
                    <span className={`task-status status-${task.status}`}>{statusLabels[task.status]}</span>
                    <time dateTime={task.createdAt}>{createdLabel(task.createdAt)}</time>
                  </header>
                  <h2 id={`task-${task.id}`}>{task.title}</h2>
                  {task.instructions && <p className="task-instructions">{task.instructions}</p>}
                  {task.statusMessage && <p className="task-message">{task.statusMessage}</p>}
                  <div className="task-meta" aria-label="Task preferences">
                    {task.usePriorContext && <span>Prior context</span>}
                    {task.useAside && <span>Aside enabled</span>}
                    {task.projectPath && <span className="task-path">{task.projectPath}</span>}
                  </div>
                  <div className="task-actions">
                    {canQueue && <button className="primary dark" type="button" disabled={busy} onClick={() => queueTask(task)}>{busy ? "Updating…" : task.status === "inbox" ? "Start" : "Retry"}<span>→</span></button>}
                    {task.codexThreadId && <a className="secondary task-thread-link" href={`codex://threads/${encodeURIComponent(task.codexThreadId)}`} aria-label={`Open ${task.title} in Codex`}>Open Codex task ↗</a>}
                    <button className="secondary task-remove" type="button" disabled={busy} onClick={() => removeTask(task)}>{busy ? "Updating…" : "Remove"}</button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty-state"><strong>No tasks yet.</strong><span>Add work above and Capital will keep the high-level status here.</span></div>
      )}
    </section>
  );
}
