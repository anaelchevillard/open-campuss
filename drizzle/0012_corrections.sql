CREATE TABLE "document_authors" (
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(12) DEFAULT 'coauteur' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_authors_document_id_user_id_pk" PRIMARY KEY("document_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "document_shares" (
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shared_by" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_shares_document_id_user_id_pk" PRIMARY KEY("document_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "exam_series_mutes" (
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_series_mutes_user_id_exam_id_pk" PRIMARY KEY("user_id","exam_id")
);
--> statement-breakpoint
CREATE TABLE "memo_pack_copies" (
	"pack_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memo_pack_copies_pack_id_user_id_pk" PRIMARY KEY("pack_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "memo_pack_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" varchar(500) DEFAULT '' NOT NULL,
	"status" varchar(10) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "memo_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"scope" varchar(36) NOT NULL,
	"document_id" uuid,
	"title" varchar(120) NOT NULL,
	"program_id" integer,
	"friends" boolean DEFAULT false NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"copies" integer DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" varchar(500) DEFAULT '' NOT NULL,
	"ip" varchar(64),
	"status" varchar(10) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "profile_follows" (
	"follower_id" uuid NOT NULL,
	"followed_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_follows_follower_id_followed_id_pk" PRIMARY KEY("follower_id","followed_id")
);
--> statement-breakpoint
CREATE TABLE "subject_follows" (
	"user_id" uuid NOT NULL,
	"subject_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_follows_user_id_subject_id_pk" PRIMARY KEY("user_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "stability" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "difficulty" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "state" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "lapses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "learning_steps" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "socials" jsonb;--> statement-breakpoint
ALTER TABLE "document_authors" ADD CONSTRAINT "document_authors_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_authors" ADD CONSTRAINT "document_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_shared_by_users_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_series_mutes" ADD CONSTRAINT "exam_series_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_series_mutes" ADD CONSTRAINT "exam_series_mutes_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_pack_copies" ADD CONSTRAINT "memo_pack_copies_pack_id_memo_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."memo_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_pack_copies" ADD CONSTRAINT "memo_pack_copies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_pack_reports" ADD CONSTRAINT "memo_pack_reports_pack_id_memo_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."memo_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_pack_reports" ADD CONSTRAINT "memo_pack_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_pack_reports" ADD CONSTRAINT "memo_pack_reports_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_packs" ADD CONSTRAINT "memo_packs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_packs" ADD CONSTRAINT "memo_packs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_packs" ADD CONSTRAINT "memo_packs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memo_packs" ADD CONSTRAINT "memo_packs_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_reset_requests" ADD CONSTRAINT "mfa_reset_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_reset_requests" ADD CONSTRAINT "mfa_reset_requests_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_follows" ADD CONSTRAINT "profile_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_follows" ADD CONSTRAINT "profile_follows_followed_id_users_id_fk" FOREIGN KEY ("followed_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_follows" ADD CONSTRAINT "subject_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_follows" ADD CONSTRAINT "subject_follows_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_authors_user_idx" ON "document_authors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_shares_user_idx" ON "document_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memo_pack_reports_status_idx" ON "memo_pack_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "memo_pack_reports_once" ON "memo_pack_reports" USING btree ("pack_id","reporter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memo_packs_owner_scope" ON "memo_packs" USING btree ("owner_id","scope");--> statement-breakpoint
CREATE INDEX "memo_packs_public_idx" ON "memo_packs" USING btree ("program_id","public");--> statement-breakpoint
CREATE INDEX "mfa_reset_requests_user_idx" ON "mfa_reset_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "profile_follows_followed_idx" ON "profile_follows" USING btree ("followed_id");--> statement-breakpoint
CREATE INDEX "subject_follows_subject_idx" ON "subject_follows" USING btree ("subject_id");
--> statement-breakpoint
UPDATE users SET prefs = prefs - 'accent' WHERE prefs ? 'accent';
--> statement-breakpoint
UPDATE user_profiles SET profile_colors = NULLIF(profile_colors - 'accent', '{}'::jsonb) WHERE profile_colors ? 'accent';
--> statement-breakpoint
INSERT INTO "document_authors" ("document_id", "user_id", "role", "added_at")
SELECT "document_id", "user_id", 'coauteur', now() FROM "doc_authors"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE flashcards f SET
  state = CASE WHEN f.last_reviewed_at IS NULL THEN 0 WHEN f.reps = 0 THEN 3 ELSE 2 END,
  stability = CASE WHEN f.last_reviewed_at IS NULL THEN 0 WHEN f.reps = 0 THEN 1 ELSE GREATEST(1, f.interval_days) END,
  difficulty = CASE WHEN f.last_reviewed_at IS NULL THEN 0 ELSE LEAST(10, GREATEST(1, 5 + (250 - f.ease) / 20.0)) END,
  lapses = (SELECT count(*) FROM card_reviews r WHERE r.card_id = f.id AND r.grade = 0)
WHERE f.stability = 0;
