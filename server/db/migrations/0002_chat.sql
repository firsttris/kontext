CREATE TABLE `chat_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text,
	`account_id` text,
	`direct_key` text,
	`created_by` text NOT NULL,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_channels_account_id_unique` ON `chat_channels` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_channels_direct_key_unique` ON `chat_channels` (`direct_key`);--> statement-breakpoint
CREATE INDEX `chat_channels_kind` ON `chat_channels` (`kind`);--> statement-breakpoint
CREATE TABLE `chat_members` (
	`channel_id` text NOT NULL,
	`member_id` text NOT NULL,
	PRIMARY KEY(`channel_id`, `member_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `chat_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_members_member` ON `chat_members` (`member_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`author_id` text NOT NULL,
	`text` text NOT NULL,
	`mentions` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `chat_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_channel` ON `chat_messages` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_reads` (
	`channel_id` text NOT NULL,
	`member_id` text NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `member_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `chat_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
