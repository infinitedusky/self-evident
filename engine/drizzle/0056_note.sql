CREATE TABLE "note" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"on" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"issue_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "note_kind" CHECK ("note"."kind" in ('note', 'decision'))
);
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_app" ON "note" USING btree ("app_id","on");