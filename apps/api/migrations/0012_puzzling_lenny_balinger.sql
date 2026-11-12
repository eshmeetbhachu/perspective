DROP INDEX "questions_active_idx";--> statement-breakpoint
DROP INDEX "questions_divided_idx";--> statement-breakpoint
CREATE INDEX "questions_active_idx" ON "questions" USING btree (("for_count" + "neutral_count" + "against_count") desc,"id" DESC NULLS FIRST) WHERE "questions"."status" = 'published';--> statement-breakpoint
CREATE INDEX "questions_divided_idx" ON "questions" USING btree (least("for_count", "against_count") desc,"id" DESC NULLS FIRST) WHERE "questions"."status" = 'published';