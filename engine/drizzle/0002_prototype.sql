CREATE TABLE "prototype" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"project_id" text,
	"title" text NOT NULL,
	"branch" text NOT NULL,
	"path" text NOT NULL,
	"port" integer,
	"status" text DEFAULT 'stopped' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "prototype_status" CHECK ("prototype"."status" in ('running', 'stopped', 'discarded'))
);
--> statement-breakpoint
ALTER TABLE "prototype" ADD CONSTRAINT "prototype_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype" ADD CONSTRAINT "prototype_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prototype_app" ON "prototype" USING btree ("app_id");