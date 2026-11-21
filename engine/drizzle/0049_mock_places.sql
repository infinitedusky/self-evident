CREATE TABLE "mock_choice" (
	"id" text PRIMARY KEY NOT NULL,
	"mock_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"place" text NOT NULL,
	"source" text NOT NULL,
	"data" text,
	"updated_at" timestamp with time zone,
	CONSTRAINT "mock_choice_place" CHECK ("mock_choice"."place" in ('prototype', 'smoke', 'review')),
	CONSTRAINT "mock_choice_source" CHECK ("mock_choice"."source" in ('default', 'live', 'replay', 'fake', 'data'))
);
--> statement-breakpoint
ALTER TABLE "mock" ADD COLUMN "places" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mock_choice" ADD CONSTRAINT "mock_choice_mock_id_mock_id_fk" FOREIGN KEY ("mock_id") REFERENCES "public"."mock"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_choice" ADD CONSTRAINT "mock_choice_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_choice_key" ON "mock_choice" USING btree ("mock_id","issue_id","place");