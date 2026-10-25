CREATE TABLE `smime_certs` (
	`member_id` text NOT NULL,
	`email` text NOT NULL,
	`fingerprint` text NOT NULL,
	`certificate` text NOT NULL,
	`issuer` text NOT NULL,
	`not_after` integer NOT NULL,
	`source` text NOT NULL,
	`previous_fingerprint` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`member_id`, `email`)
);
--> statement-breakpoint
CREATE TABLE `smime_own` (
	`member_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`fingerprint` text NOT NULL,
	`certificate` text NOT NULL,
	`p12` text NOT NULL,
	`not_after` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
