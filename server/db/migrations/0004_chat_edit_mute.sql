CREATE TABLE `chat_prefs` (
	`channel_id` text NOT NULL,
	`member_id` text NOT NULL,
	`muted` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `member_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `chat_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `edited_at` integer;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `deleted_at` integer;