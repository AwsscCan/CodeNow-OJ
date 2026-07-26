CREATE TABLE `data_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_imports_user_id_idempotency_key_unique` ON `data_imports` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `data_imports_user_id_created_at_idx` ON `data_imports` (`user_id`,`created_at`);