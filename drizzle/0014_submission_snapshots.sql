ALTER TABLE `submissions` ADD `results_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `total_duration_ms` integer;