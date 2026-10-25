CREATE TABLE `image_senders` (
	`member_id` text NOT NULL,
	`address` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`member_id`, `address`)
);
