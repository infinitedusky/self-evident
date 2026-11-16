ALTER TABLE "workflow" ADD COLUMN "style" text DEFAULT 'staged' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow" ADD COLUMN "requirements" jsonb;