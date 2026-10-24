CREATE TABLE `chat_cards` (
	`message_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`account_id` text NOT NULL,
	`ref` text NOT NULL,
	`thread_id` text,
	`party` text NOT NULL,
	`label` text NOT NULL,
	`detail` text NOT NULL,
	PRIMARY KEY(`message_id`, `position`),
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_cards_ref` ON `chat_cards` (`ref`);--> statement-breakpoint
CREATE INDEX `chat_cards_thread` ON `chat_cards` (`thread_id`);--> statement-breakpoint
CREATE INDEX `chat_cards_party` ON `chat_cards` (`party`);--> statement-breakpoint
CREATE TABLE `chat_files` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text,
	`uploaded_by` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `chat_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_files_message` ON `chat_files` (`message_id`);