CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` text NOT NULL,
	`problem_title` text NOT NULL,
	`status` text NOT NULL,
	`passed` text NOT NULL,
	`source_code` text NOT NULL,
	`submitted_at` text NOT NULL
);
