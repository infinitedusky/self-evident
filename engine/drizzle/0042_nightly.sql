CREATE TABLE "nightly" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"key" text NOT NULL,
	"workflow" text NOT NULL,
	"status" text DEFAULT 'none' NOT NULL,
	"run_id" text,
	"url" text,
	"sha" text,
	"ran_at" timestamp with time zone,
	"failing" integer DEFAULT 0 NOT NULL,
	"green_at" timestamp with time zone,
	"green_sha" text,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nightly" ADD CONSTRAINT "nightly_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nightly_app_key" ON "nightly" USING btree ("app_id","key");