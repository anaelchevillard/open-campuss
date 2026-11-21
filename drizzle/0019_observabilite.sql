CREATE TABLE "error_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigint NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"release" varchar(40) DEFAULT '' NOT NULL,
	"route" varchar(200) DEFAULT '' NOT NULL,
	"browser" varchar(20) DEFAULT '' NOT NULL,
	"os" varchar(20) DEFAULT '' NOT NULL,
	"device" varchar(20) DEFAULT '' NOT NULL,
	"message" varchar(500) DEFAULT '' NOT NULL,
	"stack" text DEFAULT '' NOT NULL,
	"reporter" varchar(16) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"source" varchar(8) NOT NULL,
	"name" varchar(80) NOT NULL,
	"message" varchar(500) NOT NULL,
	"stack" text DEFAULT '' NOT NULL,
	"route" varchar(200) DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"first_release" varchar(40) DEFAULT '' NOT NULL,
	"last_release" varchar(40) DEFAULT '' NOT NULL,
	"status" varchar(8) DEFAULT 'open' NOT NULL,
	"status_release" varchar(40),
	"status_at" timestamp with time zone,
	"regressed_at" timestamp with time zone,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"window_count" integer DEFAULT 0 NOT NULL,
	"alerted_at" timestamp with time zone,
	CONSTRAINT "error_groups_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "product_event_counts" (
	"day" date NOT NULL,
	"name" varchar(24) NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_event_counts_day_name_pk" PRIMARY KEY("day","name")
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(24) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_group_id_error_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."error_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_events_group_idx" ON "error_events" USING btree ("group_id","at");--> statement-breakpoint
CREATE INDEX "error_events_at_idx" ON "error_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "error_groups_last_idx" ON "error_groups" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "product_events_user_idx" ON "product_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "product_events_at_idx" ON "product_events" USING btree ("at");