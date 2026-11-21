import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { acceptAnswer, moderatePost, postQuestion, reportPost } from "@/app/actions/qa";
import { ActionForm, ConfirmForm } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { TextField } from "@/components/field";
import { Submit } from "@/components/submit";
import { canModerate } from "@/lib/access";
import { db, schema } from "@/lib/db";
import type { Document, User, UserProfile } from "@/lib/db/schema";
import { UserName } from "@/components/user-name";
import { profilesOf } from "@/lib/profile-data";
import { namer } from "@/lib/user-name";
import { formatDateTime } from "@/lib/documents";
import { Icon } from "@/components/icon";
import { IconSuccess } from "@/lib/icons";

function PostBody({ post, author, user, doc, canAccept, profile }: { post: typeof schema.qaPosts.$inferSelect; author: User | null; user: User; doc: Document; canAccept?: boolean; profile?: UserProfile }) {
  const mod = canModerate(user, doc);
  return (
    <div className={`${post.hidden ? "opacity-60" : ""}`}>
      <p className="flex flex-wrap items-center gap-x-2 text-[0.95rem] text-muted-foreground">
        {author && <Avatar user={author} size={22} />}
        {author ? <Link className="font-semibold text-foreground hover:underline" href={`/u/${author.id}`}><UserName user={author} profile={profile} self={author.id === user.id} /></Link> : "Ancien étudiant"}
        <span>{formatDateTime(post.createdAt)}</span>
        {post.accepted && <span className="inline-flex items-center gap-1 font-semibold text-[var(--success)]"><Icon icon={IconSuccess} className="size-4" />Réponse retenue</span>}
        {post.hidden && <span className="text-destructive">masqué</span>}
      </p>
      <p className="mt-1 whitespace-pre-line wrap-break-word">{post.body}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {canAccept && <form action={acceptAnswer}><input type="hidden" name="id" value={post.id} /><Submit size="sm" variant="ghost">{post.accepted ? "Ne plus retenir" : "Retenir cette réponse"}</Submit></form>}
        {post.authorId !== user.id && <ConfirmForm action={reportPost} confirm="Ce message sera signalé aux modérateurs."><input type="hidden" name="id" value={post.id} /><Submit size="sm" variant="ghost">Signaler</Submit></ConfirmForm>}
        {mod && <form action={moderatePost}><input type="hidden" name="id" value={post.id} /><Submit size="sm" variant="ghost">{post.hidden ? "Rétablir" : "Masquer"}</Submit></form>}
      </div>
    </div>
  );
}

/** Questions-réponses en texte brut : aucun HTML, aucun Markdown, donc rien à injecter. */
export async function QuestionsSection({ doc, user }: { doc: Document; user: User }) {
  const rows = await db.select({ post: schema.qaPosts, author: schema.users }).from(schema.qaPosts).leftJoin(schema.users, eq(schema.qaPosts.authorId, schema.users.id)).where(eq(schema.qaPosts.documentId, doc.id)).orderBy(asc(schema.qaPosts.createdAt));
  const mod = canModerate(user, doc);
  // Les non-amis voient « Prénom N. » ; police et couleur du nom de chacun
  const [nameOf, profiles] = await Promise.all([namer(user), profilesOf(rows.flatMap((r) => (r.author ? [r.author.id] : [])))]);
  const visible = rows.filter((r) => !r.post.hidden || mod).map((r) => ({ ...r, author: r.author && { ...r.author, name: nameOf(r.author) } }));
  const questions = visible.filter((r) => !r.post.parentId);
  return (
    <section id="questions" aria-label="Questions" className="mt-12 scroll-mt-32 print:hidden">
      <h2 className="mb-3 heading">Questions{questions.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{questions.length}</span>}</h2>
      <ul className="mb-6 grid gap-4">
        {questions.map(({ post, author }) => (
          <li key={post.id} className="rounded-xl bg-card shadow-xs p-3">
            <PostBody post={post} author={author} user={user} doc={doc} profile={author ? profiles.get(author.id) : undefined} />
            <ul className="mt-2 grid gap-3 border-l-2 border-border pl-3">
              {visible.filter((r) => r.post.parentId === post.id).map((r) => <li key={r.post.id}><PostBody post={r.post} author={r.author} user={user} doc={doc} profile={r.author ? profiles.get(r.author.id) : undefined} canAccept={post.authorId === user.id || mod} /></li>)}
            </ul>
            <details className="mt-2">
              <summary className="cursor-pointer text-[0.95rem] text-[var(--link)]">Répondre</summary>
              <ActionForm action={postQuestion} className="mt-2 grid gap-2">
                <input type="hidden" name="document" value={doc.id} />
                <input type="hidden" name="parent" value={post.id} />
                <TextField label="Ta réponse" name="body" id={`answer-${post.id}`} rows={2} required maxLength={4000} />
                <div><Submit size="sm" variant="outline">Publier ma réponse</Submit></div>
              </ActionForm>
            </details>
          </li>
        ))}
      </ul>
      <ActionForm action={postQuestion} className="grid gap-2">
        <input type="hidden" name="document" value={doc.id} />
        <TextField label="Poser une question" name="body" rows={2} required maxLength={4000} placeholder="Ce qui n’est pas clair…" />
        <div><Submit variant="outline" >Publier ma question</Submit></div>
      </ActionForm>
    </section>
  );
}
