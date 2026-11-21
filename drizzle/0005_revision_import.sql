CREATE TABLE "memo_decks" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"cards" jsonb NOT NULL,
	"model" varchar(80) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"inline_type" varchar(40) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_members" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_members_space_id_user_id_pk" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "revision_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"state" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "body_blocks" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "cover_file_id" uuid;--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "body_blocks" jsonb;--> statement-breakpoint
ALTER TABLE "memo_decks" ADD CONSTRAINT "memo_decks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_files" ADD CONSTRAINT "revision_files_space_id_revision_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."revision_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_members" ADD CONSTRAINT "revision_members_space_id_revision_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."revision_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_members" ADD CONSTRAINT "revision_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_spaces" ADD CONSTRAINT "revision_spaces_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_spaces" ADD CONSTRAINT "revision_spaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revision_members_user_idx" ON "revision_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_spaces_doc_owner" ON "revision_spaces" USING btree ("document_id","owner_id");