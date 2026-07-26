CREATE TABLE `admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`request_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "admin_audit_action_check" CHECK("admin_audit_logs"."action" in ('user.invite', 'user.password_reset', 'user.ban', 'user.unban', 'user.sessions_revoke', 'user.role_change', 'content.soft_delete', 'content.restore'))
);
--> statement-breakpoint
CREATE INDEX `admin_audit_admin_created_at_idx` ON `admin_audit_logs` (`admin_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_target_idx` ON `admin_audit_logs` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `code_drafts` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `session` ADD `impersonated_by` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`ban_reason` text,
	`ban_expires` integer,
	`must_change_password` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "user_role_check" CHECK("__new_user"."role" in ('user', 'admin'))
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "role", "banned", "ban_reason", "ban_expires", "must_change_password", "created_at", "updated_at") SELECT "id", "name", "email", "email_verified", "image", 'user', false, NULL, NULL, false, "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `user_role_banned_idx` ON `user` (`role`,`banned`);
