CREATE TABLE "attestations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"user_email" varchar(254) NOT NULL,
	"user_name" varchar(80) DEFAULT '' NOT NULL,
	"kind" varchar(16) NOT NULL,
	"text" text NOT NULL,
	"document_id" uuid,
	"document_title" varchar(200) DEFAULT '' NOT NULL,
	"terms_version" varchar(16) NOT NULL,
	"ip" varchar(45) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" varchar(300) NOT NULL,
	"device" varchar(16) DEFAULT '' NOT NULL,
	"browser" varchar(16) DEFAULT '' NOT NULL,
	"referrer" varchar(120) DEFAULT '' NOT NULL,
	"visitor_id" uuid,
	"user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attestations_user_idx" ON "attestations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attestations_doc_idx" ON "attestations" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "page_views_at_idx" ON "page_views" USING btree ("at");--> statement-breakpoint
CREATE INDEX "page_views_user_idx" ON "page_views" USING btree ("user_id");