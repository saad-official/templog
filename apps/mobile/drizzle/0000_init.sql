CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`kitchen_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`min_f` real,
	`max_f` real,
	`cadence_json` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `checkpoints_kitchen_idx` ON `checkpoints` (`kitchen_id`);--> statement-breakpoint
CREATE TABLE `cooling_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kitchen_id` text NOT NULL,
	`name` text NOT NULL,
	`started_at` text NOT NULL,
	`start_value_f` real,
	`stage1_reading_id` text,
	`stage1_at` text,
	`stage2_reading_id` text,
	`status` text NOT NULL,
	`completed_at` text,
	`failed_at` text,
	`fail_reason` text,
	`discarded_at` text,
	`corrective_action_json` text,
	`initials` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `cooling_items_status_idx` ON `cooling_items` (`status`);--> statement-breakpoint
CREATE INDEX `cooling_items_started_idx` ON `cooling_items` (`started_at`);--> statement-breakpoint
CREATE TABLE `kitchens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tz` text NOT NULL,
	`unit` text NOT NULL,
	`opening_hours_json` text NOT NULL,
	`owner_user_id` text,
	`join_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `readings` (
	`id` text PRIMARY KEY NOT NULL,
	`kitchen_id` text NOT NULL,
	`checkpoint_id` text,
	`cooling_item_id` text,
	`scheduled_for` text,
	`taken_at` text NOT NULL,
	`value_f` real NOT NULL,
	`result` text NOT NULL,
	`fail_reason` text,
	`corrective_action_json` text,
	`initials` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `readings_taken_idx` ON `readings` (`taken_at`);--> statement-breakpoint
CREATE INDEX `readings_cp_taken_idx` ON `readings` (`checkpoint_id`,`taken_at`);--> statement-breakpoint
CREATE INDEX `readings_cooling_idx` ON `readings` (`cooling_item_id`);--> statement-breakpoint
CREATE INDEX `readings_updated_idx` ON `readings` (`updated_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`kitchen_id` text NOT NULL,
	`table_name` text NOT NULL,
	`pushed_up_to` text,
	`pulled_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`kitchen_id`, `table_name`)
);
