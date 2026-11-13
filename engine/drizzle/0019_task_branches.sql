CREATE TABLE "save_point" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"auto" text,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_branch" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"current" boolean DEFAULT false NOT NULL,
	"from_save" text,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "save_point" ADD CONSTRAINT "save_point_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "save_point" ADD CONSTRAINT "save_point_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "save_point" ADD CONSTRAINT "save_point_branch_id_task_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."task_branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_branch" ADD CONSTRAINT "task_branch_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_branch" ADD CONSTRAINT "task_branch_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "save_point_issue" ON "save_point" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "task_branch_issue" ON "task_branch" USING btree ("issue_id");