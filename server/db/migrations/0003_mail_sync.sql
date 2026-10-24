CREATE TABLE `mail_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`account_email` text NOT NULL,
	`provider` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`login` text NOT NULL,
	`secret` text NOT NULL,
	`status` text NOT NULL,
	`state` text NOT NULL,
	`counts` text NOT NULL,
	`last_run_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
