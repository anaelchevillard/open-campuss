CREATE TABLE "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"requester_id" uuid,
	"reason" varchar(1000) NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"response" varchar(1000),
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"inline_type" varchar(40) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "published" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "batch_key" varchar(300);--> statement-breakpoint
ALTER TABLE "memo_packs" ADD COLUMN "publish_declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_images" ADD CONSTRAINT "card_images_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_requests_pending_once" ON "withdrawal_requests" USING btree ("document_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "withdrawal_requests_requester_idx" ON "withdrawal_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "card_images_owner_idx" ON "card_images" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "outbox_batch_idx" ON "outbox" USING btree ("recipient","batch_key");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "trusted_revoked_at";--> statement-breakpoint
UPDATE documents
SET published = false,
    review_requested = true,
    review_requested_at = COALESCE(review_requested_at, post_review_at),
    review_reminder_at = NULL,
    post_review_at = NULL,
    updated_at = now()
WHERE post_review_at IS NOT NULL
  AND published = true
  AND reviewed_at IS NULL;
