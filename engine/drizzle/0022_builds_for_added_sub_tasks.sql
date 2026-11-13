-- A code sub-task added by hand or by a task's agent (not by the planner) had no build, no builder and sometimes no
-- project, so the engine would never have built it. They are made like the planner's from now on (projects.ts,
-- addSubTask); these are the ones already there.
UPDATE "issue" AS s SET "project_id" = p."project_id", "delegate" = 'builder'
FROM "issue" AS p
WHERE p."id" = s."parent_id" AND p."parent_id" IS NULL AND p."kind" = 'code' AND p."project_id" IS NOT NULL
  AND s."kind" = 'code' AND s."state" NOT IN ('done', 'canceled', 'duplicate')
  AND NOT EXISTS (SELECT 1 FROM "build" b WHERE b."issue_id" = s."id");
--> statement-breakpoint
INSERT INTO "build" ("issue_id", "app_id")
SELECT s."id", s."app_id" FROM "issue" AS s JOIN "issue" AS p ON p."id" = s."parent_id"
WHERE p."parent_id" IS NULL AND p."kind" = 'code' AND p."project_id" IS NOT NULL
  AND s."kind" = 'code' AND s."state" NOT IN ('done', 'canceled', 'duplicate')
  AND NOT EXISTS (SELECT 1 FROM "build" b WHERE b."issue_id" = s."id");
