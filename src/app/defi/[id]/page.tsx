import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CopyLink } from "@/components/habits";
import { QuizRunner } from "@/components/revise/quiz-runner";
import { PageHead, Shell } from "@/components/shell";
import { currentUser, requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { compareDuel, duelFor, scoresOf } from "@/lib/duels";
import { env } from "@/lib/env";
import { friendsOf } from "@/lib/friends";

export const metadata: Metadata = { title: "Défi de quiz", referrer: "no-referrer" };

const VERDICT = { ahead: "Tu l’emportes", behind: "Avantage à l’autre, cette fois", tied: "Égalité" };

export default async function DuelPage({ params }: PageProps<"/defi/[id]">) {
  const { id } = await params;
  if (!await currentUser()) redirect(`/login?next=${encodeURIComponent(`/defi/${id}`)}`);
  const user = await requireUser();
  const access = await duelFor(id, user);
  if (!access) notFound();
  const { duel, doc, mine, challengerName } = access;
  const scores = await scoresOf(duel.id);
  const back = <p className="mb-3 text-sm"><Link className="text-muted-foreground hover:text-foreground" href="/reviser/ensemble">Retour à Ensemble</Link></p>;

  if (mine) {
    // Celui qui a joué par un lien n'est pas forcément un ami : son nom reste caché
    const friends = new Set((await friendsOf(user.id)).map((friend) => friend.id));
    return (
      <Shell user={user}>
        {back}
        <PageHead title="Ton défi" lead={doc.title} />
        <p className="mb-6 font-semibold tabular-nums">Ton score : {duel.challengerScore} sur {duel.challengerTotal}</p>
        {!duel.invitedId && duel.expiresAt > new Date() && <div className="mb-6 max-w-md"><CopyLink link={`${env.baseUrl}/defi/${duel.id}`} /></div>}
        {scores.length ? (
          <ul className="line-list max-w-xl">
            {scores.map((row) => <li key={row.userId} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0 font-semibold wrap-break-word">{friends.has(row.userId) ? row.name : "Un étudiant de ta licence"}</span><span className="tabular-nums text-muted-foreground">{row.score} sur {row.total}</span></li>)}
          </ul>
        ) : <p className="text-muted-foreground">Personne n’a encore joué.</p>}
      </Shell>
    );
  }

  const played = scores.find((row) => row.userId === user.id);
  if (played) {
    return (
      <Shell user={user}>
        {back}
        <PageHead title={VERDICT[compareDuel(played, { score: duel.challengerScore, total: duel.challengerTotal })]} lead={doc.title} />
        <ul className="line-list max-w-xl">
          <li className="flex items-center justify-between gap-3 py-2.5"><span className="font-semibold">Toi</span><span className="tabular-nums">{played.score} sur {played.total}</span></li>
          <li className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0 font-semibold wrap-break-word">{challengerName}</span><span className="tabular-nums">{duel.challengerScore} sur {duel.challengerTotal}</span></li>
        </ul>
        <p className="mt-6 text-sm"><Link className="underline underline-offset-2" href={`/d/${doc.id}/quiz`}>Rejouer le quiz, hors défi</Link></p>
      </Shell>
    );
  }

  if (duel.expiresAt < new Date()) {
    return <Shell user={user}>{back}<PageHead title="Ce défi est terminé" lead="Il n’est plus possible d’y jouer." /><Link className="underline underline-offset-2" href={`/d/${doc.id}/quiz`}>Jouer le quiz</Link></Shell>;
  }
  const [quiz] = await db.select().from(schema.quizzes).where(eq(schema.quizzes.documentId, doc.id));
  if (!quiz) notFound();
  return (
    <QuizRunner
      title={`${challengerName} te défie : ${doc.title}`} target={{ kind: "duel", duelId: duel.id, docId: doc.id }} exitHref="/reviser/ensemble" account={user.id}
      prefs={{ sounds: user.prefs.sounds, haptics: user.prefs.haptics }} showXp={false} notice="Une seule partie compte · quiz généré par Campuss IA · à vérifier"
      questions={quiz.questions.map((q) => ({ question: q.question, choices: q.choices }))}
    />
  );
}
