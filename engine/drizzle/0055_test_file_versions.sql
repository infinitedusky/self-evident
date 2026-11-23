ALTER TABLE "test_file" ADD COLUMN "real" jsonb;--> statement-breakpoint
ALTER TABLE "test_file" ADD COLUMN "use" jsonb DEFAULT '{}'::jsonb NOT NULL;