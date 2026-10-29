CREATE TABLE `smime_authorities` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`certificate` text NOT NULL,
	`subject` text NOT NULL,
	`not_after` integer NOT NULL,
	`added_by` text NOT NULL,
	`created_at` integer NOT NULL
);
