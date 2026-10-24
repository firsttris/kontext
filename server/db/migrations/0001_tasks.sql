CREATE TABLE `task_links` (
	`task_id` text NOT NULL,
	`kind` text NOT NULL,
	`account_id` text NOT NULL,
	`ref` text NOT NULL,
	`thread_id` text,
	`label` text NOT NULL,
	`detail` text NOT NULL,
	PRIMARY KEY(`task_id`, `kind`, `ref`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_links_ref` ON `task_links` (`ref`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text NOT NULL,
	`status` text NOT NULL,
	`position` real NOT NULL,
	`assignee_id` text,
	`due_date` text,
	`due_time` text,
	`checklist` text NOT NULL,
	`created_by` text NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_account` ON `tasks` (`account_id`);