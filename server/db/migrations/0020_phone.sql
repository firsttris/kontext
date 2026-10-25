CREATE TABLE `phone_boxes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text,
	`pairing_hash` text,
	`pairing_expires_at` integer,
	`version` text,
	`status` text,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phone_boxes_token_hash_unique` ON `phone_boxes` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `phone_boxes_pairing_hash_unique` ON `phone_boxes` (`pairing_hash`);--> statement-breakpoint
CREATE TABLE `phone_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`box_id` text NOT NULL,
	`box_call_id` text NOT NULL,
	`direction` text NOT NULL,
	`remote` text NOT NULL,
	`local` text NOT NULL,
	`state` text NOT NULL,
	`outcome` text,
	`member` text,
	`members` text NOT NULL,
	`room` text,
	`started_at` integer NOT NULL,
	`answered_at` integer,
	`ended_at` integer,
	`note` text NOT NULL,
	FOREIGN KEY (`box_id`) REFERENCES `phone_boxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `phone_calls_started` ON `phone_calls` (`started_at`);--> statement-breakpoint
CREATE INDEX `phone_calls_box_call` ON `phone_calls` (`box_id`,`box_call_id`);