CREATE TABLE `external_account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`imap_host` text NOT NULL,
	`imap_port` integer NOT NULL,
	`smtp_host` text NOT NULL,
	`smtp_port` integer NOT NULL,
	`login` text NOT NULL,
	`secret` text NOT NULL,
	`target` text NOT NULL,
	`folder_id` text,
	`status` text NOT NULL,
	`state` text NOT NULL,
	`counts` text NOT NULL,
	`last_run_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `external_account_account` ON `external_account` (`account_id`);