CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_ref` text,
	`title` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_conversations_user_id_updated_at_idx` ON `ai_conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `ai_conversations_user_id_problem_ref_idx` ON `ai_conversations` (`user_id`,`problem_ref`);--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`sort_order` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_messages_role_check" CHECK("ai_messages"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_messages_conversation_id_sort_order_unique` ON `ai_messages` (`conversation_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `ai_messages_user_id_conversation_id_sort_order_idx` ON `ai_messages` (`user_id`,`conversation_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`theme_mode` text DEFAULT 'light' NOT NULL,
	`editor_theme` text DEFAULT 'light' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_preferences_updated_at_idx` ON `user_preferences` (`updated_at`);