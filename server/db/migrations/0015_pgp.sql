CREATE TABLE `pgp_keys` (
	`member_id` text NOT NULL,
	`email` text NOT NULL,
	`fingerprint` text NOT NULL,
	`public_key` text NOT NULL,
	`source` text NOT NULL,
	`previous_fingerprint` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`member_id`, `email`)
);
--> statement-breakpoint
CREATE TABLE `pgp_own` (
	`member_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`fingerprint` text NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`recovery_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
