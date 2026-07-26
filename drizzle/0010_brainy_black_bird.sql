CREATE TABLE `note_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`content` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `note_comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_comments_user_note_idempotency_unique` ON `note_comments` (`user_id`,`note_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `note_comments_note_id_deleted_at_created_at_idx` ON `note_comments` (`note_id`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_comments_user_id_created_at_idx` ON `note_comments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_comments_note_id_parent_id_created_at_idx` ON `note_comments` (`note_id`,`parent_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `note_reactions` (
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `note_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "note_reactions_kind_check" CHECK("note_reactions"."kind" in ('like', 'favorite'))
);
--> statement-breakpoint
CREATE INDEX `note_reactions_note_id_kind_idx` ON `note_reactions` (`note_id`,`kind`);