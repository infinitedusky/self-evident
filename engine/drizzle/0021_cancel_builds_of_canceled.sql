-- A canceled sub-task (or a duplicate) kept its build as it was, so it read as queued and stayed in the graph.
-- Its build follows it out of the plan (issues.ts, setState, does this from now on).
UPDATE "build" SET "status" = 'cancelled', "held_reason" = coalesce("issue"."reason", "issue"."state"), "updated_at" = now()
FROM "issue"
WHERE "issue"."id" = "build"."issue_id" AND "issue"."parent_id" IS NOT NULL
  AND "issue"."state" IN ('canceled', 'duplicate') AND "build"."status" NOT IN ('done', 'cancelled');
