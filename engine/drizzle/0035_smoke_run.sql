CREATE TABLE "smoke_run" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"path" text NOT NULL,
	"sha" text NOT NULL,
	"port" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "smoke_run" ADD CONSTRAINT "smoke_run_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smoke_run" ADD CONSTRAINT "smoke_run_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "smoke_run_issue" ON "smoke_run" USING btree ("issue_id");