CREATE TABLE `online_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`host_name` text NOT NULL,
	`guest_name` text,
	`host_token_hash` text NOT NULL,
	`guest_token_hash` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`state_json` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `online_rooms_expires_at_idx` ON `online_rooms` (`expires_at`);