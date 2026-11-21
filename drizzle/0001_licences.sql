CREATE TABLE "programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
INSERT INTO "programs" ("slug","name","active","position") VALUES ('economie','Économie',true,1),('droit','Droit',false,2),('lea','LEA',false,3),('aes','AES',false,4),('gestion','Gestion',false,5);--> statement-breakpoint
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_name_unique";--> statement-breakpoint
ALTER TABLE "doc_files" ADD COLUMN "embedded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "program_id" integer;--> statement-breakpoint
UPDATE "documents" SET "program_id" = (SELECT "id" FROM "programs" WHERE "slug" = 'economie');--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "program_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "chapter" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "body_markdown" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "program_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "short_name" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "program_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "level" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_program_idx" ON "documents" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_unique_idx" ON "subjects" USING btree ("program_id","level","name");--> statement-breakpoint
INSERT INTO "subjects" ("program_id","level","name","short_name","position") SELECT p."id", 1, v.name, v.short, v.pos FROM "programs" p, (VALUES
  ('Histoire de la Pensée Économique','HPE',1),
  ('Histoire des Faits Économiques et Sociaux','HFES',2),
  ('Principes Économiques','Principes',3),
  ('Information Économique','Info éco',4),
  ('Mathématiques','Maths',5),
  ('Statistiques','Stats',6)
) AS v(name, short, pos) WHERE p."slug" = 'economie';
