CREATE TABLE "post_votes" (
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"voter_stance" "stance" NOT NULL,
	"weight" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_votes_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "helpful_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "helpful_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cross_side_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "post_votes" ADD CONSTRAINT "post_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_votes" ADD CONSTRAINT "post_votes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_votes_post_idx" ON "post_votes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_column_top_idx" ON "posts" USING btree ("question_id","stance","helpful_score" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "posts"."deleted_at" is null;