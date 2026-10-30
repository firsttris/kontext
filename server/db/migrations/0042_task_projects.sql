CREATE TABLE `task_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`columns` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_projects_account` ON `task_projects` (`account_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `project_id` text;--> statement-breakpoint
CREATE INDEX `tasks_project` ON `tasks` (`project_id`);