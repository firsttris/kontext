CREATE TABLE `signature_detail` (
	`member_id` text PRIMARY KEY NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`mobile` text DEFAULT '' NOT NULL,
	`position` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
