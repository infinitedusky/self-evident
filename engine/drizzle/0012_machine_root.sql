CREATE TABLE "machine" (
	"name" text PRIMARY KEY NOT NULL,
	"user_name" text NOT NULL,
	"root" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Paths under a home folder are stored from the root from now on (db/home-path.ts): /Users/<name>/code/x becomes ~/code/x.
UPDATE "repo" SET "local_path" = regexp_replace("local_path", '^/(Users|home)/[^/]+(/|$)', '~\2') WHERE "local_path" ~ '^/(Users|home)/[^/]+(/|$)';--> statement-breakpoint
UPDATE "session" SET "cwd" = regexp_replace("cwd", '^/(Users|home)/[^/]+(/|$)', '~\2') WHERE "cwd" ~ '^/(Users|home)/[^/]+(/|$)';--> statement-breakpoint
UPDATE "session" SET "worktree_path" = regexp_replace("worktree_path", '^/(Users|home)/[^/]+(/|$)', '~\2') WHERE "worktree_path" ~ '^/(Users|home)/[^/]+(/|$)';--> statement-breakpoint
UPDATE "build" SET "worktree_path" = regexp_replace("worktree_path", '^/(Users|home)/[^/]+(/|$)', '~\2') WHERE "worktree_path" ~ '^/(Users|home)/[^/]+(/|$)';--> statement-breakpoint
UPDATE "prototype" SET "path" = regexp_replace("path", '^/(Users|home)/[^/]+(/|$)', '~\2') WHERE "path" ~ '^/(Users|home)/[^/]+(/|$)';
