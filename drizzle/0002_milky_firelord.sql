CREATE TABLE `backlog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`energy` text DEFAULT 'Medium' NOT NULL,
	`minutes` integer DEFAULT 60 NOT NULL,
	`expected_output` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_backlog_status_created` ON `backlog_items` (`status`,`created_at`);