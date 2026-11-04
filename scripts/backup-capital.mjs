// Daily Capital backup: GET /api/backup with the runner's bypass token, save JSON, keep 30 newest.
import { execFileSync } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const url = process.env.CAPITAL_URL || "https://hourly-capital.vineethkumar-k-14679.chatgpt.site";
const dir = process.env.CAPITAL_BACKUP_DIR ?? join(homedir(), "Documents", "Capital Backups");
const token = execFileSync("security", ["find-generic-password", "-s", "Capital Runner", "-a", userInfo().username, "-w"]).toString().trim();

const response = await fetch(`${url}/api/backup`, { headers: { "X-Capital-Token": token }, signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Backup failed: HTTP ${response.status}`);
const data = await response.json();
await mkdir(dir, { recursive: true });
const file = join(dir, `capital-backup-${new Date().toISOString().slice(0, 10)}.json`);
await writeFile(file, JSON.stringify(data));
const old = (await readdir(dir)).filter((f) => f.startsWith("capital-backup-")).sort().slice(0, -30);
await Promise.all(old.map((f) => rm(join(dir, f))));
console.log(`Saved ${file}: ${data.hours.length} hours, ${data.backlog.length} backlog, ${data.tasks.length} tasks`);
