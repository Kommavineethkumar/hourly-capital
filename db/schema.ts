import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const hours = sqliteTable(
  "hours",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time"),
    intention: text("intention").notNull(),
    expectedOutput: text("expected_output").notNull().default(""),
    actualActivity: text("actual_activity").notNull().default(""),
    output: text("output").notNull().default(""),
    category: text("category").notNull(),
    score: integer("score"),
    focus: integer("focus"),
    energy: text("energy"),
    interruptions: integer("interruptions").notNull().default(0),
    notes: text("notes").notNull().default(""),
    followUp: text("follow_up").notNull().default(""),
    workMode: text("work_mode").notNull().default("human"),
    status: text("status").notNull().default("planned"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_hours_date_start").on(table.date, table.startTime),
    index("idx_hours_status").on(table.status),
  ],
);

export type Hour = typeof hours.$inferSelect;
export type NewHour = typeof hours.$inferInsert;

export const backlogItems = sqliteTable(
  "backlog_items",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    energy: text("energy").notNull().default("Medium"),
    minutes: integer("minutes").notNull().default(60),
    expectedOutput: text("expected_output").notNull().default(""),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_backlog_status_created").on(table.status, table.createdAt)],
);

export type BacklogItem = typeof backlogItems.$inferSelect;
export type NewBacklogItem = typeof backlogItems.$inferInsert;

export const codexTasks = sqliteTable(
  "codex_tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    instructions: text("instructions").notNull().default(""),
    status: text("status").notNull().default("inbox"),
    startImmediately: integer("start_immediately", { mode: "boolean" }).notNull().default(false),
    usePriorContext: integer("use_prior_context", { mode: "boolean" }).notNull().default(true),
    useAside: integer("use_aside", { mode: "boolean" }).notNull().default(false),
    projectPath: text("project_path").notNull().default(""),
    codexThreadId: text("codex_thread_id"),
    statusMessage: text("status_message").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [index("idx_codex_tasks_status_created").on(table.status, table.createdAt)],
);

export type CodexTask = typeof codexTasks.$inferSelect;
export type NewCodexTask = typeof codexTasks.$inferInsert;
