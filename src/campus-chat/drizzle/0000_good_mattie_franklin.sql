CREATE TABLE `aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`room` text NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alias_user_room` ON `aliases` (`user`,`room`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`a` text NOT NULL,
	`b` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_pair` ON `conversations` (`a`,`b`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`author` text NOT NULL,
	`name` text NOT NULL,
	`level` integer NOT NULL,
	`body` text NOT NULL,
	`media` text,
	`mime` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_room_time` ON `messages` (`room`,`created`);--> statement-breakpoint
CREATE INDEX `messages_author_time` ON `messages` (`author`,`created`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`registered` text DEFAULT '' NOT NULL,
	`nickname` text DEFAULT 'キャンパスメンバー' NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`code` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_code_unique` ON `profiles` (`code`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`reporter` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_once` ON `reports` (`message`,`reporter`);