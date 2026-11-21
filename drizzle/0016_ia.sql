CREATE TABLE "ai_usage" (
	"day" date NOT NULL,
	"task" varchar(20) NOT NULL,
	"model" varchar(80) NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_day_task_model_pk" PRIMARY KEY("day","task","model")
);
--> statement-breakpoint
ALTER TABLE "memo_decks" ADD COLUMN "prompt_version" varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "prompt_version" varchar(40) DEFAULT '' NOT NULL;