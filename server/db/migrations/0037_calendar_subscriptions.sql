CREATE TABLE `calendar_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`account_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`written` text DEFAULT '{}' NOT NULL,
	`last_sync_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL
);
