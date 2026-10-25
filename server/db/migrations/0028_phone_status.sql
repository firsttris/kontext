CREATE TABLE `phone_status` (
	`member_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`until` integer,
	`updated_at` integer NOT NULL
);
