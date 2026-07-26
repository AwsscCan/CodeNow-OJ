CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`cover_url` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`moderation_state` text DEFAULT 'visible' NOT NULL,
	`hidden_reason` text,
	`source` text DEFAULT 'standalone' NOT NULL,
	`problem_kind` text,
	`problem_ref` text,
	`like_count` integer DEFAULT 0 NOT NULL,
	`favorite_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notes_visibility_check" CHECK("notes"."visibility" in ('private', 'public')),
	CONSTRAINT "notes_status_check" CHECK("notes"."status" in ('draft', 'published')),
	CONSTRAINT "notes_moderation_state_check" CHECK("notes"."moderation_state" in ('visible', 'hidden')),
	CONSTRAINT "notes_source_check" CHECK("notes"."source" in ('standalone', 'problem')),
	CONSTRAINT "notes_problem_kind_check" CHECK("notes"."problem_kind" is null or "notes"."problem_kind" in ('private', 'public'))
);
--> statement-breakpoint
CREATE INDEX `notes_user_id_updated_at_idx` ON `notes` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `notes_user_id_deleted_at_idx` ON `notes` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `notes_user_id_problem_ref_idx` ON `notes` (`user_id`,`problem_kind`,`problem_ref`);--> statement-breakpoint
CREATE INDEX `notes_visibility_status_moderation_published_at_idx` ON `notes` (`visibility`,`status`,`moderation_state`,`published_at`);