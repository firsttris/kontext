CREATE TABLE `migration_job` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`account_email` text NOT NULL,
	`source` text NOT NULL,
	`file_name` text NOT NULL,
	`size` integer NOT NULL,
	`received` integer NOT NULL,
	`status` text NOT NULL,
	`progress` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
