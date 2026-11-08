CREATE TABLE "issue_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"heading" text NOT NULL,
	"body" text NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_comment" ADD CONSTRAINT "issue_comment_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comment" ADD CONSTRAINT "issue_comment_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comment" ADD CONSTRAINT "issue_comment_issue_app_fk" FOREIGN KEY ("issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_comment_heading" ON "issue_comment" USING btree ("issue_id","heading");--> statement-breakpoint
CREATE INDEX "issue_comment_issue" ON "issue_comment" USING btree ("issue_id");