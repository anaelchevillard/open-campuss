CREATE TABLE "site_settings" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name_style" jsonb,
	"badge_shown" varchar(32),
	"banner" jsonb,
	"profile_colors" jsonb,
	"avatar_frame" varchar(32),
	"avatar_effect" varchar(32),
	"status" jsonb,
	"showcase" jsonb,
	"privacy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"appearance_locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer,
	"academic_year" varchar(9) NOT NULL,
	"parity" smallint NOT NULL,
	"starts_on" varchar(10) NOT NULL,
	CONSTRAINT "academic_terms_unique" UNIQUE NULLS NOT DISTINCT("program_id","academic_year","parity"),
	CONSTRAINT "academic_terms_parity_check" CHECK ("academic_terms"."parity" in (1, 2))
);
--> statement-breakpoint
CREATE TABLE "document_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" varchar(12) NOT NULL,
	"reason_code" smallint,
	"body" varchar(2000) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_id" uuid,
	"field" varchar(16) NOT NULL,
	"reason" varchar(500) DEFAULT '' NOT NULL,
	"status" varchar(10) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "user_unlocks" (
	"user_id" uuid NOT NULL,
	"item" varchar(32) NOT NULL,
	"source" varchar(16) NOT NULL,
	"granted_by" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_unlocks_user_id_item_pk" PRIMARY KEY("user_id","item")
);
--> statement-breakpoint
CREATE TABLE "credit_adjustments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(300) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_adjustments_delta_check" CHECK ("credit_adjustments"."delta" between -1000 and 1000)
);
--> statement-breakpoint
DROP INDEX "subjects_unique_idx";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "target_type" varchar(20);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "target_id" varchar(64);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "target_label" varchar(200);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "reason" varchar(500);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "before" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "after" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "level" varchar(10);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "impersonation_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "user_agent" varchar(200);--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "body_blocks" jsonb;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "cover_file_id" uuid;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "excerpt" varchar(300) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connected_folders" ADD COLUMN "account_label" varchar(200) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "connected_folders" ADD COLUMN "weekly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connected_items" ADD COLUMN "external_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connected_items" ADD COLUMN "imported_by_hand" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "category" varchar(16);--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "chapter" integer;--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "anonymous" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "course_requests" ADD COLUMN "merged_into" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "friendships" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "friendships" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "mode" varchar(12) DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "study_days" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "study_days" ADD COLUMN "questions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "study_days" ADD COLUMN "correct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "study_days" ADD COLUMN "seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "semester" integer;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_badges" ADD COLUMN "granted_by" uuid;--> statement-breakpoint
ALTER TABLE "user_badges" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_badges" ADD COLUMN "revoked_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "user_habits" ADD COLUMN "best_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_habits" ADD COLUMN "vacation_until" varchar(10);--> statement-breakpoint
ALTER TABLE "user_habits" ADD COLUMN "reminder_hour" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspension_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspension_message" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provisional_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invitation_id" uuid;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reviews" ADD CONSTRAINT "document_reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unlocks" ADD CONSTRAINT "user_unlocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unlocks" ADD CONSTRAINT "user_unlocks_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "document_reviews_doc_idx" ON "document_reviews" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "profile_reports_status_idx" ON "profile_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "profile_reports_target_idx" ON "profile_reports" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "credit_adjustments_user_idx" ON "credit_adjustments" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action","at");--> statement-breakpoint
CREATE INDEX "documents_deleted_idx" ON "documents" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_semester_unique" UNIQUE NULLS NOT DISTINCT("program_id","level","semester","name");--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_semester_check" CHECK ("subjects"."semester" is null or "subjects"."semester" between 1 and 6);--> statement-breakpoint
update users set prefs = (prefs - 'dyslexic') || '{"readingFont":"atkinson","spacing":"wide"}' where prefs->>'dyslexic' = 'true';--> statement-breakpoint
update users set prefs = prefs - 'dyslexic' - 'tourDone' where prefs ? 'dyslexic' or prefs ? 'tourDone';--> statement-breakpoint
update connected_folders set weekly = true where folder_id is not null;
