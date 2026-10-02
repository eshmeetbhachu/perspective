CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"question_id" uuid NOT NULL,
	"author_id" uuid,
	"stance" "stance" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "posts_title_length" CHECK (char_length("posts"."title") between 5 and 120),
	CONSTRAINT "posts_body_length" CHECK (char_length("posts"."body") between 30 and 10000)
);
--> statement-breakpoint
CREATE TABLE "stance_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"from_stance" "stance",
	"to_stance" "stance" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stances" (
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"stance" "stance" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_stances_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stance_history" ADD CONSTRAINT "stance_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stance_history" ADD CONSTRAINT "stance_history_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stances" ADD CONSTRAINT "user_stances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stances" ADD CONSTRAINT "user_stances_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_column_idx" ON "posts" USING btree ("question_id","stance","id" DESC NULLS LAST) WHERE "posts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_author_question_stance_unique" ON "posts" USING btree ("author_id","question_id","stance") WHERE "posts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "posts_author_created_idx" ON "posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "stance_history_user_question_idx" ON "stance_history" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "user_stances_question_idx" ON "user_stances" USING btree ("question_id","stance");