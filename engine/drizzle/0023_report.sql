CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"kind" text NOT NULL,
	"from_at" timestamp with time zone NOT NULL,
	"to_at" timestamp with time zone NOT NULL,
	"label" text NOT NULL,
	"body" text NOT NULL,
	"notes" text,
	"facts" jsonb NOT NULL,
	"model" text,
	"cost_usd" numeric,
	"edited_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_kind" CHECK ("report"."kind" in ('daily', 'weekly'))
);
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_app" ON "report" USING btree ("app_id","created_at");