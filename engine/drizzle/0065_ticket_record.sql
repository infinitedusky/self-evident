CREATE TABLE "ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"key" text NOT NULL,
	"source" text,
	"title" text,
	"url" text,
	"origin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "ticket_id" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_origin_id_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_app_key" ON "ticket" USING btree ("app_id","key");--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Every ticket already read from its tracker is a ticket record, with its title, its link and the origin it is.
INSERT INTO "ticket" ("id", "app_id", "key", "source", "title", "url", "origin_id")
  SELECT 'tkt_' || substr(md5("id"), 1, 12), "app_id", upper("ref"), "source", "title", "url", "id" FROM "origin"
  ON CONFLICT ("app_id", "key") DO NOTHING;--> statement-breakpoint
-- Every ticket that was set on a task as text is one too, known by its key alone.
INSERT INTO "ticket" ("id", "app_id", "key")
  SELECT 'tkt_' || substr(md5(s."app_id" || s."key"), 1, 12), s."app_id", s."key"
  FROM (SELECT DISTINCT "app_id", upper(trim("team_ticket")) AS "key" FROM "issue" WHERE trim(coalesce("team_ticket", '')) <> '') s
  ON CONFLICT ("app_id", "key") DO NOTHING;--> statement-breakpoint
-- And the task links to the record in place of carrying the text.
UPDATE "issue" i SET "ticket_id" = t."id" FROM "ticket" t WHERE t."app_id" = i."app_id" AND t."key" = upper(trim(i."team_ticket"));
