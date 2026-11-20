ALTER TABLE "idea" DROP CONSTRAINT "idea_source";--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_source" CHECK ("idea"."source" in ('person', 'agent', 'telemetry', 'linear'));