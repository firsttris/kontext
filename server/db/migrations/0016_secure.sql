CREATE TABLE `secure_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`from_name` text NOT NULL,
	`from_email` text NOT NULL,
	`to_email` text NOT NULL,
	`sender_key` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_salt` text NOT NULL,
	`failed_tries` integer DEFAULT 0 NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`opened_at` integer,
	`open_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `secure_messages_member` ON `secure_messages` (`member_id`);--> statement-breakpoint
CREATE TABLE `secure_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`message_id`) REFERENCES `secure_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
