ALTER TABLE "note" ADD COLUMN "options" text;--> statement-breakpoint
-- What agents wrote beside the questions they asked was the options and a recommendation, and the two migrations before
-- this one put it in `background`. Background is where a question came from; that text is what there is to choose
-- between. Move it, for decisions an agent made that have no options yet.
UPDATE "note" SET "options" = "background", "background" = NULL WHERE "kind" = 'decision' AND "created_by" LIKE 'agent%' AND "background" IS NOT NULL AND "background" <> '' AND ("options" IS NULL OR "options" = '');
