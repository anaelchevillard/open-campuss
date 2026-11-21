CREATE TABLE "drive_copies" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"base" varchar(1024) NOT NULL,
	"files" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fingerprint" varchar(32) NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(500) DEFAULT '' NOT NULL,
	"href" varchar(500) DEFAULT '/' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "totp_secret" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "step_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_subject_idx" ON "documents" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "documents_created_by_idx" ON "documents" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");
--> statement-breakpoint
-- À jouer une fois, après la migration qui ajoute documents.review_requested_at et flashcards.last_reviewed_at.
-- Ne fabrique rien : quand le journal ne dit rien d'un document publié, il reste sans date et hors de la médiane.

-- Cours en attente : la demande vient du journal, sinon la dernière modification, déjà utilisée pour trier la file
update documents d
set review_requested_at = coalesce(
  (select max(a.at) from audit_log a where a.action = 'validation_demandée' and a.target = left(d.title, 300)),
  d.updated_at
)
where d.review_requested and d.review_requested_at is null;

-- Cours déjà validés : dernière demande du journal avant la publication
update documents d
set review_requested_at = (
  select max(a.at) from audit_log a
  where a.action = 'validation_demandée' and a.target = left(d.title, 300) and a.at <= d.published_at
)
where d.published and d.published_at is not null and d.review_requested_at is null;

-- Une fiche révisée a reçu dueAt = date de révision + intervalle (0,007 jour pour « à revoir ») : la date se retrouve exactement
update flashcards
set last_reviewed_at = due_at - greatest(interval_days, 0.007) * interval '1 day'
where last_reviewed_at is null and due_at > created_at;
