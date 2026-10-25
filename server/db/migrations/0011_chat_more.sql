CREATE TABLE `chat_reactions` (
	`message_id` text NOT NULL,
	`member_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `member_id`, `emoji`),
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `chat_cards` ADD `copy_id` text;--> statement-breakpoint
ALTER TABLE `chat_files` ADD `has_thumb` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `parent_id` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `folded` text;--> statement-breakpoint
CREATE INDEX `chat_messages_parent` ON `chat_messages` (`parent_id`,`created_at`);