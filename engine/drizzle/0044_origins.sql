CREATE TABLE "origin" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"source" text NOT NULL,
	"ref" text NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"body" text,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea" DROP CONSTRAINT "idea_source";--> statement-breakpoint
ALTER TABLE "idea" ADD COLUMN "origin_id" text;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "origin_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "origin_id" text;--> statement-breakpoint
ALTER TABLE "origin" ADD CONSTRAINT "origin_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "origin_app_source_ref" ON "origin" USING btree ("app_id","source","ref");--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_origin_id_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_origin_id_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_origin_id_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_source" CHECK ("idea"."source" in ('person', 'agent', 'telemetry', 'linear'));