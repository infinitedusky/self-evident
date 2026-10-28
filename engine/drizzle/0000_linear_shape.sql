CREATE TABLE "app" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"setup" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build" (
	"issue_id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"branch" text,
	"worktree_path" text,
	"base_sha" text,
	"requires_schema_change" boolean DEFAULT false NOT NULL,
	"held_reason" text,
	"updated_at" timestamp with time zone,
	CONSTRAINT "build_status" CHECK ("build"."status" in ('queued', 'ready', 'running', 'awaiting_answer', 'merging', 'testing', 'done', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"description" text,
	"starts_at" date NOT NULL,
	"ends_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycle_dates" CHECK ("cycle"."ends_at" >= "cycle"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"idea_id" text,
	"project_id" text,
	"issue_id" text,
	"run_id" text,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"chosen" text,
	"provisional" boolean DEFAULT false NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"rationale" text
);
--> statement-breakpoint
CREATE TABLE "event" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text NOT NULL,
	"idea_id" text,
	"project_id" text,
	"issue_id" text,
	"run_id" text,
	"session_id" text,
	"actor" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"idea_id" text,
	"pr_id" text,
	"kind" text NOT NULL,
	"metric" text,
	"value" numeric,
	"baseline_value" numeric,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"provider" text,
	"summary" text,
	"raw" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_kind" CHECK ("evidence"."kind" in ('baseline', 'finding', 'verdict', 'guard', 'post_ship'))
);
--> statement-breakpoint
CREATE TABLE "file_claim" (
	"app_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"path" text NOT NULL,
	CONSTRAINT "file_claim_issue_id_path_pk" PRIMARY KEY("issue_id","path")
);
--> statement-breakpoint
CREATE TABLE "idea" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"source" text NOT NULL,
	"source_ref" jsonb,
	"lane" text DEFAULT 'inbox' NOT NULL,
	"hypothesis" text,
	"baseline" jsonb,
	"measures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"testability" jsonb,
	"look_by" date,
	"decision" text,
	"decided_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "idea_source" CHECK ("idea"."source" in ('person', 'agent', 'telemetry')),
	CONSTRAINT "idea_lane" CHECK ("idea"."lane" in ('inbox', 'measuring', 'build', 'testing', 'shipped', 'parked', 'killed')),
	CONSTRAINT "idea_decision" CHECK ("idea"."decision" is null or "idea"."decision" in ('yes', 'no', 'not_yet'))
);
--> statement-breakpoint
CREATE TABLE "initiative" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"target_date" date,
	"owner" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "initiative_status" CHECK ("initiative"."status" in ('planned', 'active', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "initiative_project" (
	"initiative_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "initiative_project_initiative_id_project_id_pk" PRIMARY KEY("initiative_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "issue" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"number" integer NOT NULL,
	"kind" text DEFAULT 'code' NOT NULL,
	"parent_id" text,
	"project_id" text,
	"cycle_id" text,
	"idea_id" text,
	"title" text NOT NULL,
	"description" text,
	"brief" text,
	"state" text DEFAULT 'todo' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"estimate" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"assignee" text,
	"delegate" text,
	"waiting_on" text,
	"source" text DEFAULT 'person' NOT NULL,
	"source_ref" jsonb,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"closed_by" text,
	CONSTRAINT "issue_kind" CHECK ("issue"."kind" in ('code', 'todo')),
	CONSTRAINT "issue_state" CHECK ("issue"."state" in ('triage', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'duplicate')),
	CONSTRAINT "issue_source" CHECK ("issue"."source" in ('person', 'agent', 'idea', 'planner', 'builder')),
	CONSTRAINT "issue_delegate" CHECK ("issue"."delegate" is null or "issue"."delegate" in ('builder', 'planner', 'agent')),
	CONSTRAINT "issue_priority" CHECK ("issue"."priority" between 0 and 4),
	CONSTRAINT "issue_estimate" CHECK ("issue"."estimate" is null or "issue"."estimate" in ('S', 'M', 'L', 'XL')),
	CONSTRAINT "issue_canceled_reason" CHECK ("issue"."state" <> 'canceled' or "issue"."reason" is not null or "issue"."parent_id" is not null),
	CONSTRAINT "issue_not_own_parent" CHECK ("issue"."parent_id" is null or "issue"."parent_id" <> "issue"."id")
);
--> statement-breakpoint
CREATE TABLE "issue_relation" (
	"app_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"related_issue_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_relation_issue_id_related_issue_id_type_pk" PRIMARY KEY("issue_id","related_issue_id","type"),
	CONSTRAINT "issue_relation_type" CHECK ("issue_relation"."type" in ('blocks', 'related', 'duplicate')),
	CONSTRAINT "issue_relation_self" CHECK ("issue_relation"."issue_id" <> "issue_relation"."related_issue_id")
);
--> statement-breakpoint
CREATE TABLE "outside_pr" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"repo_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"url" text,
	"state" text NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"head_branch" text,
	"base_branch" text,
	"review_requested" boolean DEFAULT false NOT NULL,
	"review_decision" text,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outside_pr_state" CHECK ("outside_pr"."state" in ('open', 'merged', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "pr" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"project_id" text NOT NULL,
	"repo_id" text,
	"issue_id" text,
	"number" integer,
	"url" text,
	"head_branch" text,
	"base_branch" text,
	"head_sha" text,
	"merge_sha" text,
	"status" text NOT NULL,
	"additions" integer,
	"deletions" integer,
	"changed_files" integer,
	"readiness" jsonb,
	"signals" jsonb,
	"pitch" jsonb,
	"opened_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	CONSTRAINT "pr_status" CHECK ("pr"."status" in ('draft', 'open', 'queued', 'merged', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"idea_id" text,
	"name" text NOT NULL,
	"description" text,
	"content" text,
	"status" text DEFAULT 'drafting' NOT NULL,
	"integration_branch" text,
	"lead" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"target_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "project_status" CHECK ("project"."status" in ('drafting', 'proposed', 'approved', 'running', 'paused', 'landed', 'stopped', 'superseded')),
	CONSTRAINT "project_priority" CHECK ("project"."priority" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "provider_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"role" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ref" text,
	"status" text,
	"checked_at" timestamp with time zone,
	CONSTRAINT "provider_role" CHECK ("provider_connection"."role" in ('telemetry', 'code_host', 'design_system', 'model', 'sandbox', 'traces'))
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"idea_id" text,
	"project_id" text,
	"issue_id" text,
	"run_id" text,
	"text" text NOT NULL,
	"options" jsonb,
	"reason" text,
	"cost" text,
	"status" text DEFAULT 'open' NOT NULL,
	"answer" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_status" CHECK ("question"."status" in ('open', 'answered', 'skipped', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "repo" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"full_name" text NOT NULL,
	"local_path" text,
	"writable" boolean DEFAULT true NOT NULL,
	"base_branch" text
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text,
	"session_id" text,
	"attempt" integer NOT NULL,
	"kind" text NOT NULL,
	"agent" text NOT NULL,
	"model" text,
	"status" text DEFAULT 'starting' NOT NULL,
	"agent_session_id" text,
	"pid" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"cost_usd" numeric,
	"budget_cap_usd" numeric,
	"tokens" jsonb,
	"summary" text,
	"error" text,
	CONSTRAINT "run_kind" CHECK ("run"."kind" in ('plan', 'build', 'follow_up', 'verify', 'merge', 'setup', 'measure')),
	CONSTRAINT "run_status" CHECK ("run"."status" in ('starting', 'working', 'ready', 'completed', 'failed', 'stopped', 'interrupted'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"kind" text DEFAULT 'talk' NOT NULL,
	"issue_id" text,
	"cwd" text,
	"branch" text,
	"worktree_path" text,
	"title" text,
	"subject" text,
	"subject_ref" jsonb,
	"agent_session_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone,
	"auto_approve" text DEFAULT 'cheap' NOT NULL,
	CONSTRAINT "session_status" CHECK ("session"."status" in ('open', 'ended')),
	CONSTRAINT "session_kind" CHECK ("session"."kind" in ('talk', 'issue')),
	CONSTRAINT "session_auto_approve" CHECK ("session"."auto_approve" in ('free', 'cheap', 'moderate'))
);
--> statement-breakpoint
CREATE TABLE "session_message" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"session_id" text NOT NULL,
	"author" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"attachments" jsonb,
	"status" text DEFAULT 'sent' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "session_message_status" CHECK ("session_message"."status" in ('queued', 'sent', 'interrupted', 'dropped'))
);
--> statement-breakpoint
CREATE TABLE "step" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"run_id" text,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_status" CHECK ("step"."status" in ('pending', 'in_progress', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "summary" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"section" text NOT NULL,
	"body" jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"through_seq" bigint DEFAULT 0 NOT NULL,
	"model" text,
	"cost_usd" numeric,
	"trigger" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "summary_section" CHECK ("summary"."section" in ('focus')),
	CONSTRAINT "summary_trigger" CHECK ("summary"."trigger" in ('person', 'schedule'))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text,
	"email" text,
	"github_login" text,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role" CHECK ("user"."role" in ('owner', 'member', 'member_no_merge'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"pr_id" text,
	"run_id" text,
	"kind" text NOT NULL,
	"label" text,
	"name" text NOT NULL,
	"route" text,
	"blob_url" text,
	"notes" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_kind" CHECK ("verification"."kind" in ('screenshot', 'video', 'flow_diff', 'expectation', 'story', 'numbers')),
	CONSTRAINT "verification_label" CHECK ("verification"."label" is null or "verification"."label" in ('feature', 'entry_point', 'before', 'after', 'failing_now_passing', 'data_effect'))
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_workspace_key" ON "app" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_app_number" ON "cycle" USING btree ("app_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_id_app" ON "cycle" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_app_number" ON "idea" USING btree ("app_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_id_app" ON "idea" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_app_number" ON "issue" USING btree ("app_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_id_app" ON "issue" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outside_pr_repo_number" ON "outside_pr" USING btree ("repo_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "pr_repo_number" ON "pr" USING btree ("repo_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "project_id_app" ON "project" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connection_role_provider" ON "provider_connection" USING btree ("app_id","role","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "session_id_app" ON "session" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_issue_name" ON "verification" USING btree ("issue_id","name");--> statement-breakpoint
ALTER TABLE "app" ADD CONSTRAINT "app_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_issue_app_fk" FOREIGN KEY ("issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_project_app_fk" FOREIGN KEY ("project_id","app_id") REFERENCES "public"."project"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_idea_app_fk" FOREIGN KEY ("idea_id","app_id") REFERENCES "public"."idea"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_claim" ADD CONSTRAINT "file_claim_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_claim" ADD CONSTRAINT "file_claim_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_claim" ADD CONSTRAINT "file_claim_issue_app_fk" FOREIGN KEY ("issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_project" ADD CONSTRAINT "initiative_project_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_project" ADD CONSTRAINT "initiative_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_parent_id_issue_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_parent_app_fk" FOREIGN KEY ("parent_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_app_fk" FOREIGN KEY ("project_id","app_id") REFERENCES "public"."project"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_cycle_app_fk" FOREIGN KEY ("cycle_id","app_id") REFERENCES "public"."cycle"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_idea_app_fk" FOREIGN KEY ("idea_id","app_id") REFERENCES "public"."idea"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relation" ADD CONSTRAINT "issue_relation_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relation" ADD CONSTRAINT "issue_relation_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relation" ADD CONSTRAINT "issue_relation_related_issue_id_issue_id_fk" FOREIGN KEY ("related_issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relation" ADD CONSTRAINT "issue_relation_issue_app_fk" FOREIGN KEY ("issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relation" ADD CONSTRAINT "issue_relation_related_app_fk" FOREIGN KEY ("related_issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outside_pr" ADD CONSTRAINT "outside_pr_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outside_pr" ADD CONSTRAINT "outside_pr_repo_id_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_repo_id_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_project_app_fk" FOREIGN KEY ("project_id","app_id") REFERENCES "public"."project"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_idea_app_fk" FOREIGN KEY ("idea_id","app_id") REFERENCES "public"."idea"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_project_app_fk" FOREIGN KEY ("project_id","app_id") REFERENCES "public"."project"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo" ADD CONSTRAINT "repo_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_issue_app_fk" FOREIGN KEY ("issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_issue_app_fk" FOREIGN KEY ("issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_session_app_fk" FOREIGN KEY ("session_id","app_id") REFERENCES "public"."session"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_issue_app_fk" FOREIGN KEY ("issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary" ADD CONSTRAINT "summary_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_pr_id_pr_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pr"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_issue_app_fk" FOREIGN KEY ("issue_id","app_id") REFERENCES "public"."issue"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_app_status" ON "build" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "decision_app" ON "decision" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "decision_project" ON "decision" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "decision_issue" ON "decision" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "event_workspace_seq" ON "event" USING btree ("workspace_id","seq");--> statement-breakpoint
CREATE INDEX "event_issue_seq" ON "event" USING btree ("issue_id","seq");--> statement-breakpoint
CREATE INDEX "event_project_seq" ON "event" USING btree ("project_id","seq");--> statement-breakpoint
CREATE INDEX "event_app_seq" ON "event" USING btree ("app_id","seq");--> statement-breakpoint
CREATE INDEX "evidence_app" ON "evidence" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "initiative_workspace" ON "initiative" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "issue_app_state" ON "issue" USING btree ("app_id","state");--> statement-breakpoint
CREATE INDEX "issue_project" ON "issue" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "issue_parent" ON "issue" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "issue_relation_related" ON "issue_relation" USING btree ("related_issue_id");--> statement-breakpoint
CREATE INDEX "outside_pr_app" ON "outside_pr" USING btree ("app_id","state");--> statement-breakpoint
CREATE INDEX "pr_app" ON "pr" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "project_app" ON "project" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "question_app" ON "question" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "question_project" ON "question" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "repo_app" ON "repo" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "run_issue" ON "run" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "run_app" ON "run" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "session_app" ON "session" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "session_message_session" ON "session_message" USING btree ("session_id","id");--> statement-breakpoint
CREATE INDEX "step_issue" ON "step" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "summary_app_section" ON "summary" USING btree ("app_id","section","id");--> statement-breakpoint
CREATE INDEX "verification_app" ON "verification" USING btree ("app_id");