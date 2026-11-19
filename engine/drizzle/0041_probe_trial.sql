CREATE TABLE "probe_trial" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"key" text NOT NULL,
	"probe" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tasks" integer DEFAULT 0 NOT NULL,
	"cost_usd" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "probe_trial" ADD CONSTRAINT "probe_trial_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "probe_trial_app" ON "probe_trial" USING btree ("app_id","created_at");