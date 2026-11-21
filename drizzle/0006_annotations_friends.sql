CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" varchar(10) NOT NULL,
	"color" varchar(10),
	"start_offset" integer DEFAULT -1 NOT NULL,
	"end_offset" integer DEFAULT -1 NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"prefix" varchar(40) DEFAULT '' NOT NULL,
	"suffix" varchar(40) DEFAULT '' NOT NULL,
	"note" text,
	"photo_id" uuid,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"requester_id" uuid NOT NULL,
	"addressee_id" uuid NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_requester_id_addressee_id_pk" PRIMARY KEY("requester_id","addressee_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "friend_code" varchar(10) DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 10)) NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_space_id_revision_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."revision_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_photo_id_revision_files_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."revision_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_parent_id_annotations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_space_idx" ON "annotations" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair" ON "friendships" USING btree (least("requester_id", "addressee_id"),greatest("requester_id", "addressee_id"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_friend_code_unique" UNIQUE("friend_code");--> statement-breakpoint
INSERT INTO "revision_spaces" ("document_id", "owner_id") SELECT DISTINCT "document_id", "user_id" FROM "highlights" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "revision_spaces" ("document_id", "owner_id") SELECT "document_id", "user_id" FROM "personal_notes" WHERE "body" <> '' ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "annotations" ("space_id", "author_id", "kind", "color", "quote", "created_at") SELECT s."id", h."user_id", 'hl', 'yellow', h."quote", h."created_at" FROM "highlights" h JOIN "revision_spaces" s ON s."document_id" = h."document_id" AND s."owner_id" = h."user_id";--> statement-breakpoint
INSERT INTO "annotations" ("space_id", "author_id", "kind", "note", "created_at", "updated_at") SELECT s."id", n."user_id", 'note', n."body", n."updated_at", n."updated_at" FROM "personal_notes" n JOIN "revision_spaces" s ON s."document_id" = n."document_id" AND s."owner_id" = n."user_id" WHERE n."body" <> '';
