DROP INDEX "posts_column_idx";--> statement-breakpoint
DROP INDEX "posts_column_top_idx";--> statement-breakpoint
CREATE INDEX "posts_column_idx" ON "posts" USING btree ("question_id","stance","id" DESC NULLS LAST) WHERE "posts"."deleted_at" is null and "posts"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "posts_column_top_idx" ON "posts" USING btree ("question_id","stance","helpful_score" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "posts"."deleted_at" is null and "posts"."removed_at" is null;