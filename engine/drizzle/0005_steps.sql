CREATE TABLE "step_work" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"idea_id" text,
	"issue_id" text,
	"project_id" text,
	"key" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"detail" text,
	"body" text,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "step_work_status" CHECK ("step_work"."status" in ('none', 'started', 'done')),
	CONSTRAINT "step_work_one_subject" CHECK (num_nonnulls("step_work"."idea_id", "step_work"."issue_id", "step_work"."project_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ordered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "workflow_id" text;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "brief_approved_by" text;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "brief_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "workflow_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "workflow_id" text;--> statement-breakpoint
ALTER TABLE "prototype" ADD COLUMN "idea_id" text;--> statement-breakpoint
ALTER TABLE "prototype" ADD COLUMN "issue_id" text;--> statement-breakpoint
ALTER TABLE "step_work" ADD CONSTRAINT "step_work_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_work" ADD CONSTRAINT "step_work_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_work" ADD CONSTRAINT "step_work_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_work" ADD CONSTRAINT "step_work_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "step_work_app" ON "step_work" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "step_work_idea_key" ON "step_work" USING btree ("idea_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "step_work_issue_key" ON "step_work" USING btree ("issue_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "step_work_project_key" ON "step_work" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "workflow_app" ON "workflow" USING btree ("app_id");--> statement-breakpoint
ALTER TABLE "app" ADD CONSTRAINT "app_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype" ADD CONSTRAINT "prototype_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype" ADD CONSTRAINT "prototype_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Briefs written before approval existed count as approved, so no task already under way gets stuck.
UPDATE "issue" SET "brief_approved_by" = 'before approval', "brief_approved_at" = "created_at" WHERE "brief" IS NOT NULL AND "brief" <> '' AND "parent_id" IS NULL;
