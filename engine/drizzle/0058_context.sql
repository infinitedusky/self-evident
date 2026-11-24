CREATE TABLE "context_doc" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text,
	"idea_id" text,
	"project_id" text,
	"kind" text NOT NULL,
	"origin_id" text,
	"title" text NOT NULL,
	"description" text,
	"body" text,
	"file_name" text,
	"file_path" text,
	"in_full" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "context_doc_kind" CHECK ("context_doc"."kind" in ('pasted', 'file', 'ticket'))
);
--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "idea_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "project_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "status" text DEFAULT 'settled' NOT NULL;--> statement-breakpoint
ALTER TABLE "context_doc" ADD CONSTRAINT "context_doc_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_doc" ADD CONSTRAINT "context_doc_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_doc" ADD CONSTRAINT "context_doc_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_doc" ADD CONSTRAINT "context_doc_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_doc" ADD CONSTRAINT "context_doc_origin_id_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_doc_app" ON "context_doc" USING btree ("app_id");--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_status" CHECK ("note"."status" in ('settled', 'proposed', 'rejected'));