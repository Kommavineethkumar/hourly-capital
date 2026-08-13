# Capital

Capital is a private hourly accountability and career-capital system. It helps turn otherwise unstructured work hours into learning, durable artifacts, leverage, deeper domain knowledge, and future options without becoming an employee time tracker.

## Core workflow

1. Plan one useful outcome for the next hour.
2. Classify it into one of six career-capital categories.
3. Distinguish human active work, agent work, and human oversight.
4. Close the hour with what actually happened, output/evidence, value, focus, energy, and interruptions.
5. Review daily outcomes and seven-day patterns.
6. Keep finishable ideas in the opportunity backlog for the next unexpected free hour.
7. Add larger tasks to the Codex queue and follow their high-level execution status.

The system deliberately avoids streaks, minute-by-minute surveillance, guilt messages, and a single vanity productivity score.

## Included

- Fast hourly planning and close-out
- Durable private storage
- Daily timeline and review
- Seven-day category, value, output, time-of-day, interruption, and agent-leverage analysis
- Evidence-based next-hour recommendation
- Opportunity backlog that feeds the hourly planner
- Full history and CSV export
- Responsive layout and `Cmd/Ctrl + Shift + Space` capture shortcut
- Lightweight Codex task inbox with separate-thread execution and status tracking

Notion integration is intentionally out of scope for this version.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

The local address is printed after startup. Local D1 storage initializes automatically on first use.

## Verification

```bash
npx tsc --noEmit
npx eslint . --quiet --ignore-pattern dist --ignore-pattern .next
npm test
```

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

## Capital Runner

The hosted app stores the task queue. A small local runner watches that queue and starts selected work in a separate Codex task through Codex App Server. This separation keeps filesystem access, local agent history, and authenticated browser sessions on this Mac rather than in the hosted site.

The runner can attach a small, relevance-filtered context bundle from recent Codex, Claude Code, Pi, and Hermes sessions. It excludes reasoning traces, tool payloads, credentials, configuration files, and authentication data. When a task allows authenticated research, its Codex prompt directs the agent to the installed Aside Browser skill; it does not copy browser credentials into the task.

The private Sites bypass credential is stored in macOS Keychain under the service `Capital Runner`. Install the background watcher after that credential has been created:

```bash
npm run runner:install
```

For foreground diagnosis or a single queue pass:

```bash
npm run runner
npm run runner:once
```

“Start now” means the task is queued immediately. The local runner normally notices it within five seconds while this Mac is awake. The hosted site cannot directly launch a process on a sleeping or offline Mac.

## Privacy model

- The current Sites deployment is owner-only. If it is ever shared or made public, every visitor would use the same dataset because this version is intentionally single-user and does not partition records by account.
- Capital stores task instructions and information entered deliberately through the product.
- It does not collect active applications, browser history, IDE activity, terminal activity, or other passive context.
- CSV export is generated locally in the browser from the records already loaded into the product.
- History currently loads the 100 most recent records, so CSV export covers those loaded records and does not include backlog items.
- There is no bulk delete/reset control yet; manage retention before placing sensitive material in records.
- Queued Codex tasks send their instructions and any explicitly enabled, relevance-filtered context to Codex. Aside Browser is used only when enabled for that task and when authenticated web context is actually needed.
