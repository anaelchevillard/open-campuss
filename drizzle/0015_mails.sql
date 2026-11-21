ALTER TABLE "outbox" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_state" ADD COLUMN "notification_mail" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "content" jsonb;--> statement-breakpoint
UPDATE outbox
SET content = jsonb_build_object(
  'subject', subject,
  'title', upper(left(regexp_replace(subject, '^[^:]+ : ', ''), 1)) || substr(regexp_replace(subject, '^[^:]+ : ', ''), 2),
  'category', 'transactional',
  'blocks', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('type', 'p', 'text', part) ORDER BY n), '[]'::jsonb)
    FROM regexp_split_to_table(btrim(body, E' \n'), E'\n{2,}') WITH ORDINALITY AS t(part, n)
  )
)
WHERE content IS NULL AND body IS NOT NULL;
