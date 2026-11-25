CREATE TABLE "issue_ticket" (
	"issue_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"app_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_ticket_issue_id_ticket_id_pk" PRIMARY KEY("issue_id","ticket_id")
);
--> statement-breakpoint
ALTER TABLE "issue_ticket" ADD CONSTRAINT "issue_ticket_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_ticket" ADD CONSTRAINT "issue_ticket_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_ticket" ADD CONSTRAINT "issue_ticket_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;