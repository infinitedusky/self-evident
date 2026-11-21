CREATE TABLE "task_call" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"service" text NOT NULL,
	"service_name" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"what" text DEFAULT '' NOT NULL,
	"endpoint" text,
	"by" text DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_call" ADD CONSTRAINT "task_call_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_call_key" ON "task_call" USING btree ("issue_id","service","method","path");