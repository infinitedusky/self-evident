CREATE TABLE "checklist_item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"todo_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_by" text,
	"done_at" timestamp with time zone,
	"waiting_on" text
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"owner" text DEFAULT 'person' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"project_id" text,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	CONSTRAINT "todo_owner" CHECK ("todo"."owner" in ('person', 'agent')),
	CONSTRAINT "todo_status" CHECK ("todo"."status" in ('open', 'done', 'dropped')),
	CONSTRAINT "todo_dropped_reason" CHECK ("todo"."status" <> 'dropped' or "todo"."reason" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "todo_id_app" ON "todo" USING btree ("id","app_id");--> statement-breakpoint
ALTER TABLE "backlog_item" DROP CONSTRAINT "backlog_item_resolution";--> statement-breakpoint
ALTER TABLE "backlog_item" ADD COLUMN "todo_id" text;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_todo_id_todo_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_todo_app_fk" FOREIGN KEY ("todo_id","app_id") REFERENCES "public"."todo"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_project_app_fk" FOREIGN KEY ("project_id","app_id") REFERENCES "public"."project"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_item_todo" ON "checklist_item" USING btree ("todo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "todo_app_number" ON "todo" USING btree ("app_id","number");--> statement-breakpoint
CREATE INDEX "todo_app" ON "todo" USING btree ("app_id");--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_todo_id_todo_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_todo_app_fk" FOREIGN KEY ("todo_id","app_id") REFERENCES "public"."todo"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_resolution" CHECK (("backlog_item"."state" = 'open') or ("backlog_item"."state" = 'covered' and ("backlog_item"."task_id" is not null or "backlog_item"."todo_id" is not null)) or ("backlog_item"."state" = 'dropped' and "backlog_item"."reason" is not null));