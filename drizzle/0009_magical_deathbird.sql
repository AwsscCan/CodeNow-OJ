CREATE TABLE `note_problem_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`problem_kind` text NOT NULL,
	`problem_ref` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "note_problem_refs_kind_check" CHECK("note_problem_refs"."problem_kind" in ('private', 'public'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_problem_refs_note_id_sort_order_unique` ON `note_problem_refs` (`note_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `note_problem_refs_user_id_note_id_sort_order_idx` ON `note_problem_refs` (`user_id`,`note_id`,`sort_order`);