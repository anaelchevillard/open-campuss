CREATE TABLE "attestation_acceptances" (
	"user_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"category" varchar(16) DEFAULT '' NOT NULL,
	"version" varchar(16) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attestation_acceptances_user_id_kind_category_version_pk" PRIMARY KEY("user_id","kind","category","version")
);
--> statement-breakpoint
CREATE TABLE "collab_notes" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"started_by" uuid,
	"open" boolean DEFAULT false NOT NULL,
	"turns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connected_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(10) NOT NULL,
	"folder_id" varchar(100),
	"folder_name" varchar(200) DEFAULT '' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"broken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"mime" varchar(120) DEFAULT '' NOT NULL,
	"status" varchar(10) DEFAULT 'proposed' NOT NULL,
	"document_id" uuid,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_tokens" (
	"folder_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "course_request_votes" (
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_request_votes_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "course_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" integer NOT NULL,
	"author_id" uuid,
	"text" varchar(160) NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_ratings" (
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_ratings_document_id_user_id_pk" PRIMARY KEY("document_id","user_id"),
	CONSTRAINT "document_ratings_stars" CHECK ("document_ratings"."stars" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "impact_milestones" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"threshold" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memo_card_reports" (
	"document_id" uuid NOT NULL,
	"card_key" varchar(32) NOT NULL,
	"front" varchar(1000) NOT NULL,
	"back" varchar(2000) NOT NULL,
	"reports" integer DEFAULT 1 NOT NULL,
	"status" varchar(10) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memo_card_reports_document_id_card_key_pk" PRIMARY KEY("document_id","card_key")
);
--> statement-breakpoint
CREATE TABLE "notification_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"weekly_mail" boolean DEFAULT true NOT NULL,
	"weekly_mail_at" timestamp with time zone,
	"last_reminder_day" varchar(10),
	"last_visit_at" timestamp with time zone,
	"returned_from" timestamp with time zone,
	"returned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" varchar(1024) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"p256dh" varchar(200) NOT NULL,
	"auth" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_duel_scores" (
	"duel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"total" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_duel_scores_duel_id_user_id_pk" PRIMARY KEY("duel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "quiz_duels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"challenger_id" uuid NOT NULL,
	"invited_id" uuid,
	"challenger_score" integer NOT NULL,
	"challenger_total" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referee_id" uuid,
	"credited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referee_id_unique" UNIQUE("referee_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_runs" (
	"name" varchar(40) PRIMARY KEY NOT NULL,
	"day" varchar(10) NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_announcements" (
	"season" varchar(16) PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_days" (
	"user_id" uuid NOT NULL,
	"day" varchar(10) NOT NULL,
	"cards" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "study_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "study_group_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"subject_id" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "study_group_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"started_by" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_habits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"daily_goal" integer DEFAULT 5 NOT NULL,
	"season_dismissed" varchar(16),
	"invite_code" varchar(32),
	CONSTRAINT "user_habits_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "teacher_name" varchar(80) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "post_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "course_request_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trusted_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attestation_acceptances" ADD CONSTRAINT "attestation_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_notes" ADD CONSTRAINT "collab_notes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_notes" ADD CONSTRAINT "collab_notes_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_folders" ADD CONSTRAINT "connected_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_items" ADD CONSTRAINT "connected_items_folder_id_connected_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."connected_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_items" ADD CONSTRAINT "connected_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_tokens" ADD CONSTRAINT "connected_tokens_folder_id_connected_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."connected_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_tokens" ADD CONSTRAINT "connected_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_request_votes" ADD CONSTRAINT "course_request_votes_request_id_course_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."course_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_request_votes" ADD CONSTRAINT "course_request_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ratings" ADD CONSTRAINT "document_ratings_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_ratings" ADD CONSTRAINT "document_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_milestones" ADD CONSTRAINT "impact_milestones_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_card_reports" ADD CONSTRAINT "memo_card_reports_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_state" ADD CONSTRAINT "notification_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_duel_scores" ADD CONSTRAINT "quiz_duel_scores_duel_id_quiz_duels_id_fk" FOREIGN KEY ("duel_id") REFERENCES "public"."quiz_duels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_duel_scores" ADD CONSTRAINT "quiz_duel_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_duels" ADD CONSTRAINT "quiz_duels_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_duels" ADD CONSTRAINT "quiz_duels_challenger_id_users_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_duels" ADD CONSTRAINT "quiz_duels_invited_id_users_id_fk" FOREIGN KEY ("invited_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_days" ADD CONSTRAINT "study_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_meetings" ADD CONSTRAINT "study_group_meetings_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_meetings" ADD CONSTRAINT "study_group_meetings_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_meetings" ADD CONSTRAINT "study_group_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_sessions" ADD CONSTRAINT "study_group_sessions_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_sessions" ADD CONSTRAINT "study_group_sessions_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_habits" ADD CONSTRAINT "user_habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connected_folders_user_provider" ON "connected_folders" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_items_unique" ON "connected_items" USING btree ("folder_id","external_id");--> statement-breakpoint
CREATE INDEX "course_request_votes_user_idx" ON "course_request_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "course_requests_subject_idx" ON "course_requests" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "course_requests_created_idx" ON "course_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "document_ratings_user_idx" ON "document_ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memo_card_reports_status_idx" ON "memo_card_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_duel_scores_user_idx" ON "quiz_duel_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_duels_challenger_idx" ON "quiz_duels" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "quiz_duels_invited_idx" ON "quiz_duels" USING btree ("invited_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "share_links_owner_idx" ON "share_links" USING btree ("created_by","document_id");--> statement-breakpoint
CREATE INDEX "study_group_meetings_group_idx" ON "study_group_meetings" USING btree ("group_id","at");--> statement-breakpoint
CREATE INDEX "study_group_members_user_idx" ON "study_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_group_sessions_group_idx" ON "study_group_sessions" USING btree ("group_id","ends_at");--> statement-breakpoint
CREATE INDEX "study_groups_owner_idx" ON "study_groups" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_request_idx" ON "documents" USING btree ("course_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reading_progress_doc_idx" ON "reading_progress" USING btree ("document_id");
--> statement-breakpoint
-- Série : les seules traces de révision antérieures sont les dernières dates de chaque fiche, jour de Paris
INSERT INTO study_days (user_id, day, cards)
SELECT user_id, to_char(last_reviewed_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD'), count(*)
FROM flashcards WHERE last_reviewed_at IS NOT NULL
GROUP BY 1, 2
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Sans cette reprise, personne ne verrait le bloc de retour à sa première visite après le déploiement
INSERT INTO notification_state (user_id, last_visit_at)
SELECT u.id, greatest(u.last_login_at, max(s.last_seen_at))
FROM users u LEFT JOIN sessions s ON s.user_id = u.id AND NOT s.mfa_pending
GROUP BY u.id
HAVING greatest(u.last_login_at, max(s.last_seen_at)) IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
--> statement-breakpoint
-- Jusqu'ici, seul un modérateur pouvait publier : tout ce qui est en ligne a déjà été relu. Le relecteur n'a pas été noté, il reste vide.
UPDATE documents SET reviewed_at = coalesce(published_at, updated_at) WHERE published = true AND reviewed_at IS NULL;
