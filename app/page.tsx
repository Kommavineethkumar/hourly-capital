"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  workMode: string;
  status: string;
  notionStatus: string;
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

export default function Home() {
  const [view, setView] = useState<"today" | "review">("today");
  const [hours, setHours] = useState<Hour[]>([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [intention, setIntention] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [category, setCategory] = useState("Learning");
  const [workMode, setWorkMode] = useState("human");
  const [closing, setClosing] = useState(false);
  const [actualActivity, setActualActivity] = useState("");
  const [output, setOutput] = useState("");
  const [score, setScore] = useState(2);
  const [focus, setFocus] = useState(4);
  const [energy, setEnergy] = useState("Medium");
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
        window.setTimeout(() => intentionRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", shortcut);
    };
  }, []);

  useEffect(() => {
    fetch(`/api/hours?date=${today}`)
      .then(async (response) => {
        const data = (await response.json()) as { hours: Hour[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load today.");
        setHours(data.hours);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [today]);

  useEffect(() => {
    if (closing) window.setTimeout(() => actualRef.current?.focus(), 0);
  }, [closing]);

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
    if (!active || !actualActivity.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: active.id,
          endTime: clock(now),
          actualActivity,
          output,
          score,
          focus,
          energy,
        }),
      });
      const data = (await response.json()) as { hour: Hour; error?: string };
      if (!response.ok) throw new Error(data.error);
      setHours((current) => current.map((item) => (item.id === data.hour.id ? data.hour : item)));
      setClosing(false);
      setActualActivity("");
      setOutput("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not close the hour.");
    } finally {
      setSaving(false);
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("today")} aria-label="Open today">
          <span className="brand-mark">C</span>
          <span>CAPITAL</span>
        </button>
        <nav aria-label="Primary navigation">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>Today</button>
          <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>Daily review</button>
        </nav>
        <div className="privacy"><span /> Private by default</div>
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
                <div className="microcopy"><span>One clear outcome, not a task list.</span><kbd>⌘ ⇧ Space</kbd></div>

                <div className="field-label">Career capital</div>
                <div className="category-grid">
                  {categories.map(([name, description, mark]) => (
                    <button key={name} type="button" className={category === name ? "selected" : ""} onClick={() => setCategory(name)}>
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
                  <div className="mode-field">
                    <label htmlFor="mode">Effort</label>
                    <select id="mode" value={workMode} onChange={(event) => setWorkMode(event.target.value)}>
                      <option value="human">Human active</option>
                      <option value="agent">Agent work</option>
                      <option value="oversight">Human oversight</option>
                    </select>
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
      ) : (
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
      )}

      {closing && active && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setClosing(false)}>
          <form className="close-modal" onSubmit={closeHour} role="dialog" aria-modal="true" aria-labelledby="close-title">
            <button className="modal-x" type="button" onClick={() => setClosing(false)} aria-label="Close">×</button>
            <p className="eyebrow">Close the loop · {active.startTime}–{clock(now)}</p>
            <h2 id="close-title">What actually happened?</h2>
            <p className="modal-intention">Planned: {active.intention}</p>
            <label htmlFor="actual">Actual activity</label>
            <textarea id="actual" ref={actualRef} value={actualActivity} onChange={(event) => setActualActivity(event.target.value)} rows={2} placeholder="What did you actually spend the hour doing?" required />
            <label htmlFor="output">Output or evidence <span>optional</span></label>
            <input id="output" value={output} onChange={(event) => setOutput(event.target.value)} placeholder="What exists, changed, or became clear?" />
            <div className="close-row">
              <fieldset><legend>Value</legend><div className="segmented">{scoreNames.map((name, index) => <button key={name} type="button" className={score === index ? "selected" : ""} onClick={() => setScore(index)}><b>{index}</b><span>{name}</span></button>)}</div></fieldset>
              <fieldset><legend>Focus</legend><div className="focus-buttons">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={focus === value ? "selected" : ""} onClick={() => setFocus(value)}>{value}</button>)}</div></fieldset>
            </div>
            <div className="modal-footer"><label>Energy <select value={energy} onChange={(event) => setEnergy(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label><button className="primary" disabled={saving || !actualActivity.trim()}>{saving ? "Saving…" : "Save & close hour"}<span>✓</span></button></div>
          </form>
        </div>
      )}
    </main>
  );
}
