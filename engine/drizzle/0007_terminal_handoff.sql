ALTER TABLE "session" ADD COLUMN "terminal_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "imported_through" text;