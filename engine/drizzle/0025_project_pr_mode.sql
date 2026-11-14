ALTER TABLE "project" ADD COLUMN "pr_mode" text;--> statement-breakpoint
-- A project already started keeps the mode it was built in: the app's own choice, else one pull request for the project (the default until now).
UPDATE "project" p SET "pr_mode" = CASE WHEN a."setup"->>'pr_mode' IN ('issue', 'task') THEN 'issue' ELSE 'project' END FROM "app" a WHERE a."id" = p."app_id" AND p."status" NOT IN ('drafting', 'proposed', 'approved');
