DROP INDEX "smoke_run_issue";--> statement-breakpoint
ALTER TABLE "smoke_run" ADD COLUMN "setup" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "smoke_run_issue" ON "smoke_run" USING btree ("issue_id","setup");