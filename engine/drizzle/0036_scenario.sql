CREATE TABLE "scenario" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"tables" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_name" ON "scenario" USING btree ("app_id","scope","name");