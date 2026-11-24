ALTER TABLE "note" DROP CONSTRAINT "note_status";--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "answer" text;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_status" CHECK ("note"."status" in ('settled', 'proposed', 'rejected', 'open'));