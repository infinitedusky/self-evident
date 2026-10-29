-- Every app has a default workflow (Sandy, 2026-10-29: "it can't be nothing"). An app with workflows but no default
-- takes its oldest; an app with none gets "Default": the idea, research, mockups, the prototype and the brief, any
-- order, only the brief required.
UPDATE "app" SET "workflow_id" = (SELECT w."id" FROM "workflow" w WHERE w."app_id" = "app"."id" ORDER BY w."created_at" LIMIT 1)
  WHERE "workflow_id" IS NULL AND EXISTS (SELECT 1 FROM "workflow" w WHERE w."app_id" = "app"."id");--> statement-breakpoint
INSERT INTO "workflow" ("id", "app_id", "name", "steps", "ordered")
  SELECT 'wf_' || substr(md5(random()::text || "id"), 1, 12), "id", 'Default',
    '[{"key":"idea","on":true,"required":false},{"key":"research","on":true,"required":false},{"key":"mockup","on":true,"required":false},{"key":"prototype","on":true,"required":false},{"key":"brief","on":true,"required":true}]'::jsonb, false
  FROM "app" WHERE "workflow_id" IS NULL;--> statement-breakpoint
UPDATE "app" SET "workflow_id" = (SELECT w."id" FROM "workflow" w WHERE w."app_id" = "app"."id" ORDER BY w."created_at" LIMIT 1)
  WHERE "workflow_id" IS NULL;
