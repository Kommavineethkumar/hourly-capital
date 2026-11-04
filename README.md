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

Each user runs their own runner on their own Mac with their own Codex. In Capital, open **Tasks → Connect your Mac runner → Create runner token**, then on your Mac:

```bash
git clone https://github.com/Kommavineethkumar/hourly-capital.git && cd hourly-capital && npm install
security add-generic-password -U -s "Capital Runner" -a "$USER" -w "<cap_ token>"
npm run runner:install -- --api-url https://<capital-site>
```

The runner sends the token as `X-Capital-Token` and only sees that user's tasks. Optional env: `CAPITAL_URL`, `CAPITAL_PROJECTS_DIR` (default working dir, defaults to `$HOME`), `CAPITAL_CODEX_MODEL` (default `gpt-6-luna`). Revoke tokens from the same panel.

For foreground diagnosis or a single queue pass:

```bash
npm run runner
npm run runner:once
```

“Start now” means the task is queued immediately. The local runner normally notices it within five seconds while this Mac is awake. The hosted site cannot directly launch a process on a sleeping or offline Mac.

## Privacy model

- Every record (hours, backlog, tasks) belongs to the signed-in account (`oai-authenticated-user-id` from Sites sign-in). Every API reads and writes only the caller's rows.
- Runner tokens are random 256-bit values; only their SHA-256 hash is stored. Tokens can't create other tokens.
- On `localhost`, all requests are treated as one local user (`local-dev`).

## Continuous integration

GitHub Actions runs type-check, lint, build, and the rendered-HTML test suite on every push and pull request to `main` (`.github/workflows/ci.yml`). Deployment to Cloudflare remains manual via the ChatGPT Sites hosting flow; CI verifies but does not deploy.
- Capital stores task instructions and information entered deliberately through the product.
- It does not collect active applications, browser history, IDE activity, terminal activity, or other passive context.
- CSV export is generated locally in the browser from the records already loaded into the product.
- There is no bulk delete/reset control yet; manage retention before placing sensitive material in records.
- Queued Codex tasks send their instructions and any explicitly enabled, relevance-filtered context to Codex. Aside Browser is used only when enabled for that task and when authenticated web context is actually needed.

## Backup

- History → *Backup ↓* downloads your hours, backlog, and tasks as JSON (`GET /api/backup`). *Restore ↑* imports into your account; existing ids are skipped.
- `scripts/backup-capital.mjs` does the same with your runner token (saves to `~/Documents/Capital Backups`, keeps 30). Schedule it with a LaunchAgent or cron.

## Deploy

`npm run build` packages `dist/` plus `.openai/hosting.json` and `drizzle/` migrations for Sites hosting (D1 binding `DB`). Sites applies migrations on deploy. For local dev, apply `drizzle/*.sql` with wrangler as in the Sites starter docs.

## License

MIT — see `LICENSE`.
