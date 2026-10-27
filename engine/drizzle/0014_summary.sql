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
ALTER TABLE "summary" ADD CONSTRAINT "summary_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "summary_app_section" ON "summary" USING btree ("app_id","section","id");