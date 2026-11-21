import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AiWorking } from "@/components/ai/ai-working";
import { DuelOffer } from "@/components/duel";
import { LiveRefresh } from "@/components/habits";
import { QuizRunner } from "@/components/revise/quiz-runner";
import { SessionFrame } from "@/components/revise/session-frame";
import { canRead } from "@/lib/access-server";
import { aiAvailable } from "@/lib/ai-available";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { visibleDocument } from "@/lib/documents";
import { canPlay } from "@/lib/duels";
import { friendsOf } from "@/lib/friends";
import { featureOn } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage({ params }: PageProps<"/d/[id]/quiz">) {
  const user = await requireUser();
  const { doc } = await visibleDocument((await params).id, user);
  const [quiz] = await db.select().from(schema.quizzes).where(eq(schema.quizzes.documentId, doc.id));
  const exitHref = `/d/${doc.id}`;
  if (!quiz) {
    // Génération en cours : la page se recharge seule quand le quiz est prêt
    if (doc.quizStatus === "pending" && (await aiAvailable())) return (
      <SessionFrame exitHref={exitHref} exitLabel="Retour au cours" title="Quiz">
        <div className="flex flex-1 flex-col justify-center py-10">
          <AiWorking label="Campuss IA prépare le quiz…" lines={4} className="mx-auto w-full max-w-xl" />
        </div>
        <LiveRefresh seconds={6} />
      </SessionFrame>
    );
    notFound();
  }
  // Seuls les amis qui peuvent lire ce cours sont proposés : un ami d'une autre licence n'y aurait pas accès
  const duels = canPlay(doc) && (await featureOn("duels"));
  const friends = duels ? (await Promise.all((await friendsOf(user.id)).map(async (f) => ((await canRead(f, doc)) ? f : null)))).filter((f) => f !== null) : [];
  return (
    <>
      {/* Les réponses ne sont envoyées au navigateur qu'après la correction */}
      <QuizRunner
        notice="Généré par Campuss IA · à vérifier"
        title={`Quiz : ${doc.title}`} target={{ kind: "quiz", docId: doc.id }} exitHref={exitHref} account={user.id}
        prefs={{ sounds: user.prefs.sounds, haptics: user.prefs.haptics }} showXp={!user.prefs.hideGame} againHref={`/d/${doc.id}/quiz`}
        questions={quiz.questions.map((q) => ({ question: q.question, choices: q.choices }))}
        after={duels ? <DuelOffer docId={doc.id} code={user.friendCode} friends={friends.map((f) => ({ id: f.id, name: f.name, avatarKey: f.avatarKey }))} /> : undefined}
      />
    </>
  );
}
