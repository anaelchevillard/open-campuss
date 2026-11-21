CREATE TABLE "audience_counters" (
	"day" date NOT NULL,
	"kind" varchar(8) NOT NULL,
	"key" varchar(300) NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "audience_counters_day_kind_key_pk" PRIMARY KEY("day","kind","key")
);
--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "card_reviews" ADD COLUMN "before" jsonb;--> statement-breakpoint
CREATE INDEX "audience_counters_kind_idx" ON "audience_counters" USING btree ("kind","day");--> statement-breakpoint
CREATE INDEX "card_reviews_card_idx" ON "card_reviews" USING btree ("card_id","at");