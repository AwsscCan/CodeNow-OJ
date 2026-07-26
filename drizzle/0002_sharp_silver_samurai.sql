CREATE TABLE `auth_rate_limits` (
	`key_hash` text NOT NULL,
	`action` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`key_hash`, `action`)
);
--> statement-breakpoint
CREATE INDEX `auth_rate_limits_expires_at_idx` ON `auth_rate_limits` (`expires_at`);