CREATE TYPE "public"."question_status" AS ENUM('pending', 'published', 'removed');--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"status" "question_status" DEFAULT 'published' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', description), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_title_length" CHECK (char_length("questions"."title") between 10 and 150),
	CONSTRAINT "questions_description_length" CHECK (char_length("questions"."description") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "questions_slug_unique" ON "questions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "questions_status_id_idx" ON "questions" USING btree ("status","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "questions_created_by_idx" ON "questions" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "questions_search_idx" ON "questions" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "questions_title_trgm_idx" ON "questions" USING gin ("title" gin_trgm_ops);