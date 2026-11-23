ALTER TABLE "scenario" ADD COLUMN "real" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "smoke_run" ADD COLUMN "fixture" text;