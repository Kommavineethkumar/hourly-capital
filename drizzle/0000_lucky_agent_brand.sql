CREATE TABLE `hours` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`intention` text NOT NULL,
	`expected_output` text DEFAULT '' NOT NULL,
	`actual_activity` text DEFAULT '' NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`score` integer,
	`focus` integer,
	`energy` text,
	`interruptions` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`follow_up` text DEFAULT '' NOT NULL,
	`work_mode` text DEFAULT 'human' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`notion_status` text DEFAULT 'not_configured' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_hours_date_start` ON `hours` (`date`,`start_time`);--> statement-breakpoint
CREATE INDEX `idx_hours_status` ON `hours` (`status`);