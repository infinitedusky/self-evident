CREATE TABLE "task_service" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"mock_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_service" ADD CONSTRAINT "task_service_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_service" ADD CONSTRAINT "task_service_mock_id_mock_id_fk" FOREIGN KEY ("mock_id") REFERENCES "public"."mock"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_service_key" ON "task_service" USING btree ("issue_id","mock_id");