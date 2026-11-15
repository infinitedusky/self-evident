DROP INDEX "app_workspace_key";--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "app_workspace_key" ON "app" USING btree ("workspace_id","key") WHERE "app"."removed_at" is null;