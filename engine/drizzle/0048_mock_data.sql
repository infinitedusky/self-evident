CREATE TABLE "mock_data" (
	"id" text PRIMARY KEY NOT NULL,
	"mock_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"files" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recording" text,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issue_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "mock_data_kind" CHECK ("mock_data"."kind" in ('real', 'faked', 'invented'))
);
--> statement-breakpoint
ALTER TABLE "mock" ADD COLUMN "default_data" text;--> statement-breakpoint
ALTER TABLE "mock_data" ADD CONSTRAINT "mock_data_mock_id_mock_id_fk" FOREIGN KEY ("mock_id") REFERENCES "public"."mock"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_data" ADD CONSTRAINT "mock_data_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_data_key" ON "mock_data" USING btree ("mock_id","key");