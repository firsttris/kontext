ALTER TABLE `tasks` ADD `assigned_by` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `assigned_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `remind_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `reminded_at` integer;--> statement-breakpoint
CREATE INDEX `tasks_remind_at` ON `tasks` (`remind_at`);