CREATE TABLE "learning" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"key" text NOT NULL,
	"summary" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"sha" text,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "learning" ADD CONSTRAINT "learning_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_app_key" ON "learning" USING btree ("app_id","key");