CREATE TABLE "test_file" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text,
	"name" text NOT NULL,
	"what" text DEFAULT '' NOT NULL,
	"media_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"checked" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "test_file" ADD CONSTRAINT "test_file_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_file" ADD CONSTRAINT "test_file_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_file_app" ON "test_file" USING btree ("app_id","issue_id");