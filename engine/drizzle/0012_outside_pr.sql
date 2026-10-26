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
ALTER TABLE "outside_pr" ADD CONSTRAINT "outside_pr_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outside_pr" ADD CONSTRAINT "outside_pr_repo_id_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outside_pr_repo_number" ON "outside_pr" USING btree ("repo_id","number");--> statement-breakpoint
CREATE INDEX "outside_pr_app" ON "outside_pr" USING btree ("app_id","state");