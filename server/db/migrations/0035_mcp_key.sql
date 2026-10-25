CREATE TABLE `mcp_key` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_key_key_hash_unique` ON `mcp_key` (`key_hash`);--> statement-breakpoint
CREATE INDEX `mcp_key_user` ON `mcp_key` (`user_id`);