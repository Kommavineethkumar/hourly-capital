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
    notionStatus: text("notion_status").notNull().default("not_configured"),
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
