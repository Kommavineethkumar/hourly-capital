"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import TasksView from "./components/tasks-view";

const categories = [
  ["Learning", "Understand something new", "L"],
  ["Artifact Creation", "Make something durable", "A"],
  ["Opportunity Development", "Increase future options", "O"],
  ["Automation & Leverage", "Save future effort", "↗"],
  ["Work & Domain Depth", "Know the system better", "D"],
  ["Reflection & Optimization", "Improve how you work", "R"],
] as const;

type Hour = {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  intention: string;
  expectedOutput: string;
  actualActivity: string;
  output: string;
  category: string;
  score: number | null;
  focus: number | null;
  energy: string | null;
  interruptions: number;
  notes: string;
  followUp: string;
  workMode: string;
  status: string;
};

const scoreNames = ["Lost", "Maintenance", "Productive", "Compounding"];
const colors: Record<string, string> = {
  Learning: "violet",
  "Artifact Creation": "blue",
  "Opportunity Development": "amber",
  "Automation & Leverage": "green",
  "Work & Domain Depth": "rose",
  "Reflection & Optimization": "slate",
};

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function clock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function displayDate(date: Date) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(date);
}

type View = "today" | "tasks" | "review" | "insights" | "backlog" | "history";
type BacklogItem = { id: string; title: string; category: string; energy: string; minutes: number; expectedOutput: string; status: string };

function minutesBetween(start: string, end: string | null) {
  if (!end) return 60;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const value = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return value > 0 && value < 12 * 60 ? value : 60;
}

function exportCsv(records: Hour[]) {
  const fields: (keyof Hour)[] = ["date", "startTime", "endTime", "category", "intention", "expectedOutput", "actualActivity", "output", "score", "focus", "energy", "interruptions", "workMode", "status"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [fields.join(","), ...records.map((record) => fields.map((field) => escape(record[field])).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `capital-hours-${localDate()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function downloadBackup() {
  const response = await fetch("/api/backup", { cache: "no-store" });
  if (!response.ok) throw new Error("Backup failed.");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = `capital-backup-${localDate()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function restoreBackup(file: File) {
  const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
  const data = (await response.json()) as { imported?: { hours: number; backlog: number; tasks: number }; error?: string };
  if (!response.ok || !data.imported) throw new Error(data.error ?? "Restore failed.");
  return data.imported;
}

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [hours, setHours] = useState<Hour[]>([]);
  const [history, setHistory] = useState<Hour[]>([]);
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [intention, setIntention] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [category, setCategory] = useState("Learning");
  const [workMode, setWorkMode] = useState("human");
  const [closing, setClosing] = useState(false);
  const [actualActivity, setActualActivity] = useState("");
  const [output, setOutput] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [energy, setEnergy] = useState("");
  const [interruptions, setInterruptions] = useState(0);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [editingHour, setEditingHour] = useState<Hour | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyPageSize = 50;
  const [editingBacklogId, setEditingBacklogId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("Learning");
  const [editEnergy, setEditEnergy] = useState("Medium");
  const [editMinutes, setEditMinutes] = useState(60);
  const [editExpectedOutput, setEditExpectedOutput] = useState("");
  const [idea, setIdea] = useState("");
  const [ideaCategory, setIdeaCategory] = useState("Learning");
  const [ideaOutput, setIdeaOutput] = useState("");
  const [ideaEnergy, setIdeaEnergy] = useState("Medium");
  const [ideaMinutes, setIdeaMinutes] = useState(60);
  const intentionRef = useRef<HTMLTextAreaElement>(null);
  const actualRef = useRef<HTMLTextAreaElement>(null);

  const today = localDate(now);
  const active = hours.find((hour) => hour.status === "planned");
  const completed = hours.filter((hour) => hour.status === "completed");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        setView("today");
        if (active) setClosing(true);
        else window.setTimeout(() => intentionRef.current?.focus(), 0);
      }
      if (event.key === "Escape") { setClosing(false); setEditingHour(null); }
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", shortcut);
    };
  }, [active]);

  useEffect(() => {
    Promise.all([fetch(`/api/hours?date=${today}`), fetch("/api/backlog")])
      .then(async (response) => {
        const [todayResponse, backlogResponse] = response;
        const todayData = (await todayResponse.json()) as { hours: Hour[]; error?: string };
        const backlogData = (await backlogResponse.json()) as { items: BacklogItem[]; error?: string };
        if (!todayResponse.ok) throw new Error(todayData.error || "Could not load today.");
        if (!backlogResponse.ok) throw new Error(backlogData.error || "Could not load backlog.");
        setHours(todayData.hours);
        setBacklog(backlogData.items);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: String(historyPageSize), offset: String(historyPage * historyPageSize) });
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (searchCategory) params.set("category", searchCategory);
    if (searchFrom) params.set("from", searchFrom);
    if (searchTo) params.set("to", searchTo);
    const timer = window.setTimeout(() => {
      setHistoryLoading(true);
      fetch(`/api/hours?${params}`)
        .then(async (response) => {
          const data = (await response.json()) as { hours: Hour[]; total?: number; error?: string };
          if (!response.ok) throw new Error(data.error || "Could not load history.");
          if (cancelled) return;
          setHistory(data.hours);
          setHistoryTotal(data.total ?? data.hours.length);
        })
        .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load history."); })
        .finally(() => { if (!cancelled) setHistoryLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchQuery, searchCategory, searchFrom, searchTo, historyPage]);

  useEffect(() => {
    if (closing || editingHour) window.setTimeout(() => actualRef.current?.focus(), 0);
  }, [closing, editingHour]);

  async function startHour(event: FormEvent) {
    event.preventDefault();
    if (!intention.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          startTime: clock(now),
          intention,
          expectedOutput,
          category,
          workMode,
        }),
      });
      const data = (await response.json()) as { hour: Hour; error?: string };
      if (!response.ok) throw new Error(data.error);
      setHours((current) => [data.hour, ...current]);
      setHistory((current) => [data.hour, ...current]);
      setIntention("");
      setExpectedOutput("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the hour.");
    } finally {
      setSaving(false);
    }
  }

  async function closeHour(event: FormEvent) {
    event.preventDefault();
    const target = editingHour ?? active;
    if (!target || !actualActivity.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target.id,
          endTime: editingHour ? editingHour.endTime ?? clock(now) : clock(now),
          actualActivity,
          output,
          score,
          focus,
          energy,
          interruptions,
          notes,
          followUp,
        }),
      });
      const data = (await response.json()) as { hour: Hour; error?: string };
      if (!response.ok) throw new Error(data.error);
      setHours((current) => current.map((item) => (item.id === data.hour.id ? data.hour : item)));
      setHistory((current) => current.map((item) => (item.id === data.hour.id ? data.hour : item)));
      setClosing(false);
      setActualActivity("");
      setOutput("");
      setInterruptions(0);
      setScore(null);
      setFocus(null);
      setEnergy("");
      setNotes("");
      setFollowUp("");
      setEditingHour(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not close the hour.");
    } finally {
      setSaving(false);
    }
  }

  async function addIdea(event: FormEvent) {
    event.preventDefault();
    if (!idea.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/backlog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: idea, category: ideaCategory, expectedOutput: ideaOutput, energy: ideaEnergy, minutes: ideaMinutes }) });
      const data = (await response.json()) as { item: BacklogItem; error?: string };
      if (!response.ok) throw new Error(data.error);
      setBacklog((current) => [data.item, ...current]);
      setIdea("");
      setIdeaOutput("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the idea."); }
    finally { setSaving(false); }
  }

  function planIdea(item: BacklogItem) {
    setIntention(item.title);
    setExpectedOutput(item.expectedOutput);
    setCategory(item.category);
    setView("today");
    window.setTimeout(() => intentionRef.current?.focus(), 0);
  }

  function editIdea(item: BacklogItem) {
    setEditingBacklogId(item.id);
    setEditTitle(item.title);
    setEditCategory(item.category);
    setEditEnergy(item.energy);
    setEditMinutes(item.minutes);
    setEditExpectedOutput(item.expectedOutput);
  }

  async function saveBacklogEdit(item: BacklogItem) {
    if (!editTitle.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/backlog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, title: editTitle, category: editCategory, energy: editEnergy, minutes: editMinutes, expectedOutput: editExpectedOutput }) });
      const data = (await response.json()) as { item?: BacklogItem; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error || "Could not save.");
      const saved = data.item;
      setBacklog((current) => current.map((entry) => entry.id === item.id ? saved : entry));
      setEditingBacklogId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBacklogItem(item: BacklogItem) {
    if (!window.confirm(`Remove "${item.title}" from the backlog?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/backlog", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove.");
      setBacklog((current) => current.filter((entry) => entry.id !== item.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove.");
    } finally {
      setSaving(false);
    }
  }

  async function completeIdea(item: BacklogItem) {
    const response = await fetch("/api/backlog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: "done" }) });
    if (response.ok) setBacklog((current) => current.filter((entry) => entry.id !== item.id));
  }

  function editHour(hour: Hour) {
    setEditingHour(hour);
    setActualActivity(hour.actualActivity);
    setOutput(hour.output);
    setScore(hour.score);
    setFocus(hour.focus);
    setEnergy(hour.energy ?? "");
    setInterruptions(hour.interruptions);
    setNotes(hour.notes);
    setFollowUp(hour.followUp);
  }

  async function removeHour(hour: Hour) {
    const description = hour.status === "planned" ? "the in-progress hour" : `“${hour.intention}”`;
    if (!window.confirm(`Remove ${description} from your timeline? This cannot be undone.`)) return;

    setDeletingId(hour.id);
    setError("");
    try {
      const response = await fetch("/api/hours", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hour.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove the entry.");
      setHours((current) => current.filter((entry) => entry.id !== hour.id));
      setHistory((current) => current.filter((entry) => entry.id !== hour.id));
      if (active?.id === hour.id) setClosing(false);
      if (editingHour?.id === hour.id) setEditingHour(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove the entry.");
    } finally {
      setDeletingId(null);
    }
  }

  const stats = useMemo(() => {
    const valuable = completed.filter((hour) => (hour.score ?? 0) >= 2).length;
    const compounding = completed.filter((hour) => hour.score === 3).length;
    const outputs = completed.filter((hour) => hour.output.trim()).length;
    const focusAverage = completed.length
      ? completed.reduce((sum, hour) => sum + (hour.focus ?? 0), 0) / completed.filter((hour) => hour.focus).length
      : 0;
    return { valuable, compounding, outputs, focusAverage: Number.isFinite(focusAverage) ? focusAverage : 0 };
  }, [completed]);

  const categoryTotals = useMemo(
    () => categories.map(([name]) => [name, completed.filter((hour) => hour.category === name).length] as const),
    [completed],
  );

  const bestCategory = categoryTotals.reduce((best, item) => (item[1] > best[1] ? item : best), categoryTotals[0]);

  const weekly = useMemo(() => {
    const cutoff = localDate(new Date(now.getTime() - 6 * 86_400_000));
    const records = history.filter((hour) => hour.status === "completed" && hour.date >= cutoff && hour.date <= today);
    const duration = (record: Hour) => minutesBetween(record.startTime, record.endTime);
    const totalMinutes = records.reduce((sum, record) => sum + duration(record), 0);
    const compoundingMinutes = records.filter((record) => record.score === 3).reduce((sum, record) => sum + duration(record), 0);
    const outputMinutes = records.filter((record) => record.output.trim()).reduce((sum, record) => sum + duration(record), 0);
    const reactive = records.filter((record) => record.interruptions > 0 || record.score === 1);
    const agent = records.filter((record) => record.workMode === "agent");
    const oversight = records.filter((record) => record.workMode === "oversight");
    const timeBands = [
      ["Morning", records.filter((record) => Number(record.startTime.slice(0, 2)) < 12)],
      ["Afternoon", records.filter((record) => { const value = Number(record.startTime.slice(0, 2)); return value >= 12 && value < 17; })],
      ["Evening", records.filter((record) => Number(record.startTime.slice(0, 2)) >= 17)],
    ] as const;
    const bestBand = timeBands.reduce((best, band) => {
      const average = band[1].length ? band[1].reduce((sum, record) => sum + (record.score ?? 0), 0) / band[1].length : -1;
      return average > best.average ? { name: band[0], average } : best;
    }, { name: "Not enough data", average: -1 });
    const categoryCounts = categories.map(([name]) => ({ name, count: records.filter((record) => record.category === name).length }));
    const strongest = categoryCounts.reduce((best, item) => item.count > best.count ? item : best, categoryCounts[0]);
    const drift = records.filter((record) => record.score === 0 || record.interruptions >= 2).length;
    const recommendation = records.length < 3
      ? "Record three closed hours to unlock a recommendation grounded in your own patterns."
      : reactive.length > Math.max(1, records.length / 3)
        ? "Protect the next hour from interruptions: choose one finishable output and close everything unrelated."
        : strongest.name === "Learning" && outputMinutes < totalMinutes * .45
          ? "Convert the next learning block into evidence: finish with a note, experiment, or explanation."
          : `Use your next high-energy block for ${strongest.name.toLowerCase()}; it is currently producing the clearest momentum.`;
    return { records, totalMinutes, compoundingMinutes, outputMinutes, reactive, agent, oversight, bestBand, strongest, drift, recommendation };
  }, [history, now, today]);

  const historyGroups = useMemo(() => {
    const groups = new Map<string, Hour[]>();
    history.filter((hour) => hour.status === "completed").forEach((hour) => groups.set(hour.date, [...(groups.get(hour.date) ?? []), hour]));
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [history]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("today")} aria-label="Open today">
          <span className="brand-mark">C</span>
          <span>CAPITAL</span>
        </button>
        <nav aria-label="Primary navigation">
          <button aria-current={view === "today" ? "page" : undefined} className={view === "today" ? "active" : ""} onClick={() => setView("today")}>Today</button>
          <button aria-current={view === "tasks" ? "page" : undefined} className={view === "tasks" ? "active" : ""} onClick={() => setView("tasks")}>Tasks</button>
          <button aria-current={view === "review" ? "page" : undefined} className={view === "review" ? "active" : ""} onClick={() => setView("review")}>Review</button>
          <button aria-current={view === "insights" ? "page" : undefined} className={view === "insights" ? "active" : ""} onClick={() => setView("insights")}>Insights</button>
          <button aria-current={view === "backlog" ? "page" : undefined} className={view === "backlog" ? "active" : ""} onClick={() => setView("backlog")}>Backlog</button>
          <button aria-current={view === "history" ? "page" : undefined} className={view === "history" ? "active" : ""} onClick={() => setView("history")}>History</button>
        </nav>
        <div className="privacy"><span /> Owner-only deployment</div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {view === "today" ? (
        <>
          <section className="day-heading">
            <div>
              <p className="eyebrow" suppressHydrationWarning>{displayDate(now)}</p>
              <h1>What deserves this hour?</h1>
              <p>Choose one useful outcome. The record can stay honest even if the plan changes.</p>
            </div>
            <div className="clock"><strong suppressHydrationWarning>{clock(now)}</strong><span>Your local time</span></div>
          </section>

          {active ? (
            <section className="active-hour card">
              <div className="active-stripe" />
              <div className="active-copy">
                <div className="section-label"><span className="pulse" /> IN PROGRESS · STARTED {active.startTime}</div>
                <h2>{active.intention}</h2>
                {active.expectedOutput && <p><b>Expected output</b> {active.expectedOutput}</p>}
                <div className="tag-row">
                  <span className={`tag ${colors[active.category]}`}>{active.category}</span>
                  <span className="tag neutral">{active.workMode === "agent" ? "Agent work" : active.workMode === "oversight" ? "Human oversight" : "Human active work"}</span>
                </div>
              </div>
              <button className="primary dark" onClick={() => setClosing(true)}>Close this hour <span>→</span></button>
            </section>
          ) : (
            <form className="plan-card card" onSubmit={startHour}>
              <div className="step-number">01</div>
              <div className="plan-body">
                <label htmlFor="intention">Intention</label>
                <textarea
                  id="intention"
                  ref={intentionRef}
                  value={intention}
                  onChange={(event) => setIntention(event.target.value)}
                  placeholder="e.g. Understand SQL Server worker-thread exhaustion"
                  rows={2}
                  required
                />
                <div className="microcopy"><span>One clear outcome, not a task list. Shortcut works while Capital is focused.</span><kbd>⌘ ⇧ Space</kbd></div>

                <div className="field-label">Career capital</div>
                <div className="category-grid">
                  {categories.map(([name, description, mark]) => (
                    <button key={name} type="button" aria-pressed={category === name} className={category === name ? "selected" : ""} onClick={() => setCategory(name)}>
                      <span className={`category-mark ${colors[name]}`}>{mark}</span>
                      <span><b>{name}</b><small>{description}</small></span>
                    </button>
                  ))}
                </div>

                <div className="form-row">
                  <div className="output-field">
                    <label htmlFor="expected">Expected output <span>optional</span></label>
                    <input id="expected" value={expectedOutput} onChange={(event) => setExpectedOutput(event.target.value)} placeholder="A note, decision, commit, diagram…" />
                  </div>
                  <div className="mode-field select-field">
                    <label htmlFor="mode">Effort</label>
                    <select id="mode" value={workMode} onChange={(event) => setWorkMode(event.target.value)}>
                      <option value="human">Human active</option>
                      <option value="agent">Agent work</option>
                      <option value="oversight">Human oversight</option>
                    </select>
                    <span className="select-arrow" aria-hidden="true">⌄</span>
                  </div>
                </div>
                <button className="primary" disabled={!intention.trim() || saving}>{saving ? "Starting…" : "Begin the hour"}<span>→</span></button>
              </div>
            </form>
          )}

          <section className="today-grid">
            <div className="timeline-panel">
              <div className="panel-heading"><div><p className="eyebrow">The evidence</p><h2>Today’s timeline</h2></div><span>{completed.length} closed</span></div>
              {loading ? <div className="empty-state">Loading today…</div> : hours.length === 0 ? (
                <div className="empty-state"><strong>Your first hour starts above.</strong><span>Only outcomes worth remembering need to be recorded.</span></div>
              ) : (
                <div className="timeline">
                  {[...hours].sort((a, b) => b.startTime.localeCompare(a.startTime)).map((hour) => (
                    <article key={hour.id} className="timeline-item">
                      <div className="time"><b>{hour.startTime}</b><span>{hour.endTime || "Now"}</span></div>
                      <div className={`dot ${colors[hour.category]}`} />
                      <div className="timeline-copy">
                        <div><span className={`tag ${colors[hour.category]}`}>{hour.category}</span>{hour.score !== null && <span className="score">{hour.score} · {scoreNames[hour.score]}</span>}</div>
                        <h3>{hour.intention}</h3>
                        {hour.output && <p><b>Output</b> {hour.output}</p>}
                        {hour.followUp && <p className="follow-up-badge"><span>→</span> {hour.followUp}</p>}
                      </div>
                      <div className="entry-actions">
                        {hour.status === "completed" && <button className="edit-entry" type="button" onClick={() => editHour(hour)} aria-label={`Edit ${hour.intention}`}>Edit</button>}
                        <button className="remove-entry" type="button" disabled={deletingId === hour.id} onClick={() => removeHour(hour)} aria-label={`Remove ${hour.intention} from timeline`}>{deletingId === hour.id ? "Removing…" : "Remove"}</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className="signal-panel">
              <div className="panel-heading"><div><p className="eyebrow">Today at a glance</p><h2>Signals, not scores</h2></div></div>
              <div className="stat-grid">
                <div><strong>{stats.valuable}</strong><span>valuable hours</span></div>
                <div><strong>{stats.outputs}</strong><span>durable outputs</span></div>
                <div><strong>{stats.compounding}</strong><span>compounding</span></div>
                <div><strong>{stats.focusAverage ? stats.focusAverage.toFixed(1) : "—"}</strong><span>avg. focus / 5</span></div>
              </div>
              <div className="distribution">
                <p>Career capital mix</p>
                {categoryTotals.map(([name, count]) => (
                  <div key={name}><span><i className={colors[name]} />{name}</span><b>{count}</b></div>
                ))}
              </div>
              <p className="principle">“A two-hour breakthrough matters more than six hours of motion.”</p>
            </aside>
          </section>
        </>
      ) : view === "review" ? (
        <section className="review-page">
          <div className="review-heading"><p className="eyebrow" suppressHydrationWarning>Daily review · {displayDate(now)}</p><h1>Turn today into tomorrow’s advantage.</h1><p>A concise interpretation of your records. No generic motivation.</p></div>
          <div className="review-grid">
            <article className="review-narrative card">
              <span className="section-label">DAY IN REVIEW</span>
              <h2>{completed.length ? `${stats.valuable} of ${completed.length} closed hours produced a useful outcome.` : "There is not enough evidence yet."}</h2>
              <p>{completed.length ? `${bestCategory[0]} received the most attention today. You recorded ${stats.outputs} durable ${stats.outputs === 1 ? "output" : "outputs"} and ${stats.compounding} compounding ${stats.compounding === 1 ? "hour" : "hours"}. Treat this as a pattern to inspect, not a grade.` : "Close at least one hour and this review will summarize what changed, what was created, and what deserves to continue."}</p>
            </article>
            <article className="review-list card"><h3>What came out of today?</h3>{completed.filter((hour) => hour.output).length ? completed.filter((hour) => hour.output).map((hour) => <div key={hour.id}><span className={`category-mark ${colors[hour.category]}`}>✓</span><p><b>{hour.output}</b><small>{hour.category}</small></p></div>) : <p className="muted">No outputs recorded yet.</p>}</article>
            <article className="review-list card"><h3>What should continue?</h3>{completed.length ? completed.slice(0, 3).map((hour) => <div key={hour.id}><span className="category-mark slate">→</span><p><b>{hour.intention}</b><small>{hour.score === 3 ? "Strong candidate for another block" : "Review whether a follow-up is worthwhile"}</small></p></div>) : <p className="muted">Tomorrow’s recommendation will be grounded in completed hours.</p>}</article>
          </div>
        </section>
      ) : view === "insights" ? (
        <section className="insights-page">
          <div className="review-heading"><p className="eyebrow">Last seven days · Evidence only</p><h1>Find what compounds.</h1><p>Patterns appear only when the records support them. Sparse evidence stays sparse.</p></div>
          <article className="recommendation-card card">
            <div><span className="section-label">WHAT SHOULD I DO WITH THE NEXT FREE HOUR?</span><h2>{weekly.recommendation}</h2></div>
            <button className="primary dark" onClick={() => { setView("today"); window.setTimeout(() => intentionRef.current?.focus(), 0); }}>Plan this hour <span>→</span></button>
          </article>
          <div className="insight-stats">
            <div><strong>{(weekly.totalMinutes / 60).toFixed(1)}</strong><span>hours recorded</span></div>
            <div><strong>{weekly.totalMinutes ? Math.round(weekly.compoundingMinutes / weekly.totalMinutes * 100) : 0}%</strong><span>compounding share</span></div>
            <div><strong>{weekly.totalMinutes ? Math.round(weekly.outputMinutes / weekly.totalMinutes * 100) : 0}%</strong><span>ended with evidence</span></div>
            <div><strong>{weekly.drift}</strong><span>drift signals</span></div>
          </div>
          <div className="insights-grid">
            <article className="analysis-card card"><p className="eyebrow">Time of day</p><h3>{weekly.bestBand.average >= 0 ? `${weekly.bestBand.name} is your strongest window.` : "More evidence needed."}</h3><p>{weekly.bestBand.average >= 0 ? `Average value is ${weekly.bestBand.average.toFixed(1)} / 3 in this window.` : "Close hours across more than one part of the day to compare them."}</p></article>
            <article className="analysis-card card"><p className="eyebrow">Career capital</p><h3>{weekly.strongest.count ? `${weekly.strongest.name} leads this week.` : "No category leads yet."}</h3><p>{weekly.strongest.count ? `${weekly.strongest.count} closed ${weekly.strongest.count === 1 ? "hour" : "hours"} created the current signal.` : "Your category mix will appear after the first completed hour."}</p></article>
            <article className="analysis-card card"><p className="eyebrow">AI leverage</p><h3>{weekly.agent.length} agent hours, {weekly.oversight.length} oversight hours.</h3><p>{weekly.agent.length ? `${weekly.agent.filter((hour) => hour.output).length} agent blocks ended with recorded evidence.` : "Mark delegated work separately to see leverage without inflating human effort."}</p></article>
            <article className="analysis-card card"><p className="eyebrow">Reactive load</p><h3>{weekly.reactive.length} hours showed maintenance or interruption.</h3><p>{weekly.reactive.length ? "Look for repeated timing before changing your schedule; a single interruption is not a pattern." : "No recurring reactive-load signal has appeared this week."}</p></article>
          </div>
          <article className="week-table card">
            <div className="panel-heading"><div><p className="eyebrow">Daily shape</p><h2>Seven-day evidence</h2></div><span>{weekly.records.length} closed hours</span></div>
            {[...Array(7)].map((_, index) => {
              const date = localDate(new Date(now.getTime() - (6 - index) * 86_400_000));
              const day = weekly.records.filter((hour) => hour.date === date);
              const valuable = day.filter((hour) => (hour.score ?? 0) >= 2).length;
              return <div className="week-row" key={date}><span>{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}</span><div><i style={{ width: `${day.length ? Math.max(8, valuable / day.length * 100) : 0}%` }} /></div><b>{day.length ? `${valuable}/${day.length} valuable` : "No records"}</b></div>;
            })}
          </article>
        </section>
      ) : view === "tasks" ? (
        <TasksView />
      ) : view === "backlog" ? (
        <section className="history-page">
          <div className="review-heading"><p className="eyebrow">Opportunity backlog</p><h1>Never waste a surprise hour.</h1><p>Keep only ideas that can become a useful output, clearer knowledge, leverage, or optionality.</p></div>
          <form className="idea-form card" onSubmit={addIdea}>
            <label htmlFor="idea">Capture an opportunity</label>
            <div className="idea-capture-grid">
              <input id="idea" value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="e.g. Compare three Rust LDAP libraries and record the tradeoffs" required />
              <input aria-label="Expected output" value={ideaOutput} onChange={(event) => setIdeaOutput(event.target.value)} placeholder="Expected output (optional)" />
              <button className="primary" disabled={!idea.trim() || saving}>Add idea <span>+</span></button>
            </div>
            <div className="idea-select-grid">
              <label className="select-field">Category<select value={ideaCategory} onChange={(event) => setIdeaCategory(event.target.value)}>{categories.map(([name]) => <option key={name}>{name}</option>)}</select><span className="select-arrow" aria-hidden="true">⌄</span></label>
              <label className="select-field">Energy needed<select value={ideaEnergy} onChange={(event) => setIdeaEnergy(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select><span className="select-arrow" aria-hidden="true">⌄</span></label>
              <label className="select-field">Time needed<select value={ideaMinutes} onChange={(event) => setIdeaMinutes(Number(event.target.value))}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select><span className="select-arrow" aria-hidden="true">⌄</span></label>
            </div>
          </form>
          <div className="backlog-grid">
            {backlog.length ? backlog.map((item) => editingBacklogId === item.id ? (
              <form className="backlog-card card backlog-inline-edit" key={item.id} onSubmit={(event) => { event.preventDefault(); void saveBacklogEdit(item); }}>
                <label htmlFor={`edit-title-${item.id}`}>Title
                  <input id={`edit-title-${item.id}`} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required />
                </label>
                <div className="edit-backlog-row">
                  <label className="select-field">Category<select value={editCategory} onChange={(event) => setEditCategory(event.target.value)}>{categories.map(([name]) => <option key={name}>{name}</option>)}</select><span className="select-arrow" aria-hidden="true">⌄</span></label>
                  <label className="select-field">Energy<select value={editEnergy} onChange={(event) => setEditEnergy(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select><span className="select-arrow" aria-hidden="true">⌄</span></label>
                  <label className="select-field">Min<select value={editMinutes} onChange={(event) => setEditMinutes(Number(event.target.value))}><option value={30}>30</option><option value={45}>45</option><option value={60}>60</option><option value={90}>90</option></select><span className="select-arrow" aria-hidden="true">⌄</span></label>
                </div>
                <label htmlFor={`edit-output-${item.id}`}>Expected output <span>optional</span>
                  <input id={`edit-output-${item.id}`} value={editExpectedOutput} onChange={(event) => setEditExpectedOutput(event.target.value)} />
                </label>
                <div>
                  <button className="primary" disabled={saving}>{saving ? "Saving…" : "Save"}<span>✓</span></button>
                  <button className="secondary" type="button" onClick={() => setEditingBacklogId(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <article className="backlog-card card" key={item.id}>
                <div className="tag-row"><span className={`tag ${colors[item.category]}`}>{item.category}</span><span className="tag neutral">{item.minutes} min · {item.energy} energy</span></div>
                <h2>{item.title}</h2>
                {item.expectedOutput && <p>{item.expectedOutput}</p>}
                <div>
                  <button className="secondary" onClick={() => completeIdea(item)}>Done</button>
                  <button className="secondary" onClick={() => editIdea(item)}>Edit</button>
                  <button className="secondary danger" onClick={() => deleteBacklogItem(item)}>Delete</button>
                  <button className="primary dark" onClick={() => planIdea(item)}>Plan this <span>→</span></button>
                </div>
              </article>
            )) : <div className="empty-state"><strong>No opportunities waiting.</strong><span>Add a learning question, artifact, automation idea, or role to explore.</span></div>}
          </div>
        </section>
      ) : (
        <section className="history-page">
          <div className="review-heading history-heading"><div><p className="eyebrow">Your evidence archive</p><h1>History, without surveillance.</h1><p>Only the hours and outcomes you deliberately recorded.</p></div><div className="history-actions"><button className="secondary" onClick={() => exportCsv(history)}>Export CSV ↓</button><button className="secondary" onClick={() => downloadBackup().catch((e: Error) => setError(e.message))}>Backup ↓</button><label className="secondary button-like">Restore ↑<input type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) restoreBackup(file).then((n) => { window.alert(`Restored ${n.hours} hours, ${n.backlog} backlog items, ${n.tasks} tasks. Reloading.`); window.location.reload(); }).catch((e: Error) => setError(e.message)); }} /></label></div></div>
          <form className="history-search card" onSubmit={(event) => event.preventDefault()}>
            <input aria-label="Search history" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setHistoryPage(0); }} placeholder="Search intention, activity, output, notes…" />
            <label className="select-field">Category<select value={searchCategory} onChange={(event) => { setSearchCategory(event.target.value); setHistoryPage(0); }}><option value="">All categories</option>{categories.map(([name]) => <option key={name}>{name}</option>)}</select><span className="select-arrow" aria-hidden="true">⌄</span></label>
            <label className="select-field">From<input type="date" value={searchFrom} onChange={(event) => { setSearchFrom(event.target.value); setHistoryPage(0); }} /></label>
            <label className="select-field">To<input type="date" value={searchTo} onChange={(event) => { setSearchTo(event.target.value); setHistoryPage(0); }} /></label>
            {(searchQuery || searchCategory || searchFrom || searchTo) && <button className="secondary" type="button" onClick={() => { setSearchQuery(""); setSearchCategory(""); setSearchFrom(""); setSearchTo(""); setHistoryPage(0); }}>Clear</button>}
          </form>
          {historyLoading ? <div className="empty-state">Loading history…</div> : historyGroups.length ? historyGroups.map(([date, records]) => (
            <article className="history-day card" key={date}>
              <header><div><p className="eyebrow">{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p><h2>{records.filter((hour) => hour.output).length} outputs from {records.length} hours</h2></div><strong>{records.filter((hour) => hour.score === 3).length} compounding</strong></header>
              {records.sort((a, b) => b.startTime.localeCompare(a.startTime)).map((hour) => <div className="history-record" key={hour.id}><span className="history-time">{hour.startTime}</span><span className={`category-mark ${colors[hour.category]}`}>{categories.find(([name]) => name === hour.category)?.[2] ?? "·"}</span><div><h3>{hour.intention}</h3><p>{hour.output || hour.actualActivity}</p></div><span className="history-score">{hour.score ?? "—"} / 3</span><div className="entry-actions"><button className="edit-entry" type="button" onClick={() => editHour(hour)} aria-label={`Edit ${hour.intention}`}>Edit</button><button className="remove-entry" type="button" disabled={deletingId === hour.id} onClick={() => removeHour(hour)} aria-label={`Remove ${hour.intention} from history`}>{deletingId === hour.id ? "Removing…" : "Remove"}</button></div></div>)}
            </article>
          )) : <div className="empty-state"><strong>No matching hours.</strong><span>Adjust the search or record hours to build your archive.</span></div>}
          <div className="history-pager">
            {historyTotal > historyPageSize && (
              <>
                <button className="secondary" type="button" disabled={historyPage === 0 || historyLoading} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}>← Newer</button>
                <span>Page {historyPage + 1} of {Math.max(1, Math.ceil(historyTotal / historyPageSize))} · {historyTotal} records</span>
                <button className="secondary" type="button" disabled={(historyPage + 1) * historyPageSize >= historyTotal || historyLoading} onClick={() => setHistoryPage((page) => page + 1)}>Older →</button>
              </>
            )}
            {historyTotal <= historyPageSize && historyTotal > 0 && <span>{historyTotal} records</span>}
          </div>
        </section>
      )}

      {(() => { const modalHour = editingHour ?? (closing && active ? active : null); return modalHour ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setClosing(false); setEditingHour(null); } }}>
          <form className="close-modal" onSubmit={closeHour} role="dialog" aria-modal="true" aria-labelledby="close-title">
            <button className="modal-x" type="button" onClick={() => { setClosing(false); setEditingHour(null); }} aria-label="Close">×</button>
            <p className="eyebrow">{editingHour ? "Edit hour" : "Close the loop"} · {modalHour.startTime}–{modalHour.endTime || clock(now)}</p>
            <h2 id="close-title">{editingHour ? "Revise this hour." : "What actually happened?"}</h2>
            <p className="modal-intention">Planned: {modalHour.intention}</p>
            <label htmlFor="actual">Actual activity</label>
            <textarea id="actual" ref={actualRef} value={actualActivity} onChange={(event) => setActualActivity(event.target.value)} rows={2} placeholder="What did you actually spend the hour doing?" required />
            <label htmlFor="output">Output or evidence <span>optional</span></label>
            <input id="output" value={output} onChange={(event) => setOutput(event.target.value)} placeholder="What exists, changed, or became clear?" />
            <label htmlFor="notes">Notes <span>optional</span></label>
            <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Anything worth remembering about this hour — context, blockers, impressions." />
            <label htmlFor="followUp">Follow-up <span>optional</span></label>
            <input id="followUp" value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="A question, action, or topic to revisit." />
            <div className="close-row">
              <fieldset><legend>Value <span>optional</span></legend><div className="segmented">{scoreNames.map((name, index) => <button key={name} type="button" aria-pressed={score === index} className={score === index ? "selected" : ""} onClick={() => setScore(score === index ? null : index)}><b>{index}</b><span>{name}</span></button>)}</div></fieldset>
              <fieldset><legend>Focus <span>optional</span></legend><div className="focus-buttons">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-pressed={focus === value} className={focus === value ? "selected" : ""} onClick={() => setFocus(focus === value ? null : value)}>{value}</button>)}</div></fieldset>
            </div>
            <div className="modal-footer"><div className="footer-fields"><label className="select-field">Energy <span>optional</span><select value={energy} onChange={(event) => setEnergy(event.target.value)}><option value="">Not set</option><option>Low</option><option>Medium</option><option>High</option></select><span className="select-arrow" aria-hidden="true">⌄</span></label><label className="select-field">Interruptions <select value={interruptions} onChange={(event) => setInterruptions(Number(event.target.value))}><option value={0}>None</option><option value={1}>One</option><option value={2}>Two</option><option value={3}>Three+</option></select><span className="select-arrow" aria-hidden="true">⌄</span></label></div><button className="primary" disabled={saving || !actualActivity.trim()}>{saving ? "Saving…" : editingHour ? "Save changes" : "Save & close hour"}<span>✓</span></button></div>
          </form>
        </div>
      ) : null; })()}
    </main>
  );
}
