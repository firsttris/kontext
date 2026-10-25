CREATE TABLE `task_boards` (
	`account_id` text PRIMARY KEY NOT NULL,
	`columns` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeat` text;