ALTER TABLE `tasks` ADD `dav_name` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `dav_uid` text;--> statement-breakpoint
CREATE INDEX `tasks_dav_name` ON `tasks` (`account_id`,`dav_name`);