CREATE TABLE `snoozes` (
	`account_id` text NOT NULL,
	`email_id` text NOT NULL,
	`until` integer NOT NULL,
	`user_id` text NOT NULL,
	`by` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `email_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snoozes_until` ON `snoozes` (`until`);