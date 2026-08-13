CREATE TABLE `codex_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'inbox' NOT NULL,
	`start_immediately` integer DEFAULT false NOT NULL,
	`use_prior_context` integer DEFAULT true NOT NULL,
	`use_aside` integer DEFAULT false NOT NULL,
	`project_path` text DEFAULT '' NOT NULL,
	`codex_thread_id` text,
	`status_message` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`started_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_codex_tasks_status_created` ON `codex_tasks` (`status`,`created_at`);