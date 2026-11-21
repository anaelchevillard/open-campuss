CREATE TABLE "blog_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"size" bigint NOT NULL,
	"inline_type" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post_meta" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"notify" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "card_reviews" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"grade" smallint NOT NULL,
	"ms" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_quests" (
	"user_id" uuid NOT NULL,
	"day" varchar(10) NOT NULL,
	"quest" varchar(32) NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"target" integer NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "daily_quests_user_id_day_quest_pk" PRIMARY KEY("user_id","day","quest")
);
--> statement-breakpoint
CREATE TABLE "friend_invites" (
	"token" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"uses_left" smallint DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_reactions" (
	"actor_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"event_key" varchar(64) NOT NULL,
	"kind" varchar(8) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_reactions_actor_id_event_key_pk" PRIMARY KEY("actor_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "admin_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"author_id" uuid,
	"body" varchar(2000) NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_dismissals" (
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_dismissals_announcement_id_user_id_pk" PRIMARY KEY("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body" varchar(140) NOT NULL,
	"href" varchar(500),
	"tone" varchar(10) DEFAULT 'info' NOT NULL,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dismissible" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banned_identities" (
	"email_hmac" varchar(64) PRIMARY KEY NOT NULL,
	"reason" varchar(300) DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "impersonations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"admin_session_hash" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "impersonations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"email" varchar(254),
	"name" varchar(80) DEFAULT '' NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"program_id" integer,
	"level" integer,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"allowed_domain" varchar(120),
	"message" varchar(500) DEFAULT '' NOT NULL,
	"batch_id" uuid,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "blog_files" ADD CONSTRAINT "blog_files_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blog_post_meta" ADD CONSTRAINT "blog_post_meta_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_card_id_flashcards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_quests" ADD CONSTRAINT "daily_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "friend_invites" ADD CONSTRAINT "friend_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "friend_reactions" ADD CONSTRAINT "friend_reactions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "friend_reactions" ADD CONSTRAINT "friend_reactions_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "banned_identities" ADD CONSTRAINT "banned_identities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "card_reviews_user_idx" ON "card_reviews" USING btree ("user_id","at");
--> statement-breakpoint
CREATE INDEX "friend_invites_user_idx" ON "friend_invites" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "friend_reactions_target_idx" ON "friend_reactions" USING btree ("target_id");
--> statement-breakpoint
CREATE INDEX "admin_notes_user_idx" ON "admin_notes" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "announcement_dismissals_user_idx" ON "announcement_dismissals" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "announcements_window_idx" ON "announcements" USING btree ("starts_at","ends_at");
--> statement-breakpoint
CREATE INDEX "impersonations_admin_idx" ON "impersonations" USING btree ("admin_id","started_at");
--> statement-breakpoint
CREATE INDEX "impersonations_target_idx" ON "impersonations" USING btree ("target_id");
--> statement-breakpoint
CREATE INDEX "invitations_batch_idx" ON "invitations" USING btree ("batch_id");
--> statement-breakpoint
CREATE INDEX "invitations_pending_idx" ON "invitations" USING btree ("sent_at");
--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");
--> statement-breakpoint
insert into document_reviews (document_id, author_id, kind, reason_code, body, created_at)
select d.id, null, 'rejected', null, left(d.review_note, 2000), d.updated_at
from documents d
where d.published = false
  and d.review_note is not null
  and d.deleted_at is null
  and not exists (select 1 from document_reviews r where r.document_id = d.id and r.kind in ('rejected', 'removed'));
--> statement-breakpoint
insert into blog_post_meta (post_id, notify, notified_at)
select id, false, now() from blog_posts where published
on conflict (post_id) do nothing;
--> statement-breakpoint
create extension if not exists pg_trgm;
--> statement-breakpoint
create index if not exists course_requests_text_trgm on course_requests using gin (text gin_trgm_ops);
--> statement-breakpoint
create index if not exists documents_title_trgm on documents using gin (title gin_trgm_ops);
--> statement-breakpoint
WITH days AS (
  SELECT user_id, day::date AS d FROM study_days WHERE cards + questions > 0
), islands AS (
  SELECT user_id, d - (row_number() OVER (PARTITION BY user_id ORDER BY d))::int AS grp FROM days
), runs AS (
  SELECT user_id, max(n) AS best FROM (SELECT user_id, grp, count(*) AS n FROM islands GROUP BY user_id, grp) r GROUP BY user_id
)
INSERT INTO user_habits (user_id, best_streak)
SELECT user_id, best FROM runs
ON CONFLICT (user_id) DO UPDATE SET best_streak = greatest(user_habits.best_streak, excluded.best_streak);
