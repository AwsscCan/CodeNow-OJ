CREATE TABLE `code_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_kind` text NOT NULL,
	`problem_ref` text NOT NULL,
	`language` text NOT NULL,
	`source_code` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `code_drafts_user_id_problem_ref_language_unique` ON `code_drafts` (`user_id`,`problem_ref`,`language`);--> statement-breakpoint
CREATE INDEX `code_drafts_user_id_updated_at_idx` ON `code_drafts` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folders_user_id_parent_id_sort_order_idx` ON `folders` (`user_id`,`parent_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`folder_id` text,
	`problem_code` text NOT NULL,
	`title` text NOT NULL,
	`difficulty` text NOT NULL,
	`time_limit` text NOT NULL,
	`memory_limit` text NOT NULL,
	`description` text NOT NULL,
	`input_format` text NOT NULL,
	`output_format` text NOT NULL,
	`origin` text DEFAULT 'private' NOT NULL,
	`source_url` text,
	`extraction_status` text,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problems_user_id_problem_code_unique` ON `problems` (`user_id`,`problem_code`);--> statement-breakpoint
CREATE INDEX `problems_user_id_folder_id_deleted_at_idx` ON `problems` (`user_id`,`folder_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `problems_user_id_updated_at_idx` ON `problems` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`input` text NOT NULL,
	`expected_output` text NOT NULL,
	`category` text,
	`scale` integer,
	`targets` text,
	`reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `test_cases_problem_id_sort_order_unique` ON `test_cases` (`problem_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `test_cases_user_id_problem_id_sort_order_idx` ON `test_cases` (`user_id`,`problem_id`,`sort_order`);