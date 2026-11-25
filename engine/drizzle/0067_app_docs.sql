CREATE TABLE "app_doc" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT 'user' NOT NULL,
	"updated_by" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app_doc" ADD CONSTRAINT "app_doc_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_doc_app" ON "app_doc" USING btree ("app_id");