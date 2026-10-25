CREATE TABLE `mcp_key` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text,
	`client_id` text,
	`scopes` text DEFAULT 'read' NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_key_key_hash_unique` ON `mcp_key` (`key_hash`);--> statement-breakpoint
CREATE INDEX `mcp_key_user` ON `mcp_key` (`user_id`);--> statement-breakpoint
CREATE INDEX `mcp_key_client` ON `mcp_key` (`user_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `mcp_log` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`tool` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `mcp_key`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mcp_log_connection` ON `mcp_log` (`connection_id`,`created_at`);