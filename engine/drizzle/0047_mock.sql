CREATE TABLE "mock" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"stands_in_for" text DEFAULT '' NOT NULL,
	"upstream" text,
	"status" text DEFAULT 'needs_recording' NOT NULL,
	"cmd" text,
	"env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"files" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"needs" jsonb,
	"issue_id" text,
	"recording" text,
	"recorded_at" timestamp with time zone,
	"mined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "mock_status" CHECK ("mock"."status" in ('needs_recording', 'assumed', 'mined'))
);
--> statement-breakpoint
ALTER TABLE "mock" ADD CONSTRAINT "mock_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock" ADD CONSTRAINT "mock_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_key" ON "mock" USING btree ("app_id","key");