import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { FlashGame } from "@/components/revise/flash-game";
import { PublishInvite } from "@/components/revise/publish-invite";
import { QuizRequestButton } from "@/components/revise/quiz-request";
import { QuizRunner } from "@/components/revise/quiz-runner";
import { SessionFrame } from "@/components/revise/session-frame";
import { SessionPlayer } from "@/components/revise/session-player";
import { buttonVariants } from "@/components/ui/button";
import { aiAvailable } from "@/lib/ai-available";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { cardCounts } from "@/lib/card-counts";
import { gameSnapshot, subjectScores } from "@/lib/habits";
import { IconCards, IconQuiz, IconSubjects } from "@/lib/icons";
import { deckSession } from "@/lib/deck-session";
import { FREE_SCOPE, parseScope } from "@/lib/memo-pack-rules";
import { CARDS_MOCK_MIN, cardsMockQuestions, MOCK_MAX_QUESTIONS, MOCK_MIN_QUESTIONS, mockShortfall } from "@/lib/mock-exam";
import { coursesWithoutQuiz, examPapers, myCardsInSubject, quizQuestionsBySubject, quizSources } from "@/lib/mock-exam-server";
import { mockExamQuestions, todaySession } from "@/lib/today-plan";
import { inSentence } from "@/lib/subject-name";

export const metadata: Metadata = { title: "Séance" };

const { flashcards, subjects } = schema;

/** La matière demandée, seulement si elle est de la licence de la personne (sinon ignorée). */
async function subjectOf(user: { programId: number | null; role: string }, raw: unknown) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [subject] = await db.select({ id: subjects.id, name: subjects.name, programId: subjects.programId }).from(subjects).where(eq(subjects.id, id));
  return subject && (user.role === "admin" || subject.programId === user.programId) ? subject : null;
}

export default async function SessionPage({ searchParams }: PageProps<"/reviser/seance">) {
  const user = await requireUser();
  const params = await searchParams;
  const mode = typeof params.mode === "string" ? params.mode : "classique";
  const subject = await subjectOf(user, params.matiere);
  const prefs = { sounds: user.prefs.sounds, haptics: user.prefs.haptics };
  const playGame = !user.prefs.hideGame;

  if (mode === "eclair") {
    const cards = await db.select({ id: flashcards.id, term: flashcards.front, definition: flashcards.back }).from(flashcards)
      .where(and(eq(flashcards.userId, user.id), isNull(flashcards.suspendedAt), sql`length(${flashcards.front}) <= 160`, sql`length(${flashcards.back}) <= 220`)).orderBy(desc(flashcards.lastReviewedAt), asc(flashcards.createdAt)).limit(40);
    if (cards.length < 4) return <Empty title="Il faut 4 fiches pour jouer" description="Crée quelques fiches sur un cours, puis reviens associer termes et définitions." href="/reviser/fiches/nouveau" label="Créer des fiches" />;
    return <FlashGame pairs={cards} account={user.id} prefs={prefs} showXp={playGame} />;
  }

  if (mode === "partiel") {
    let focus = subject;
    if (!focus && user.programId) {
      const [exam] = await db.select({ id: subjects.id, name: subjects.name, programId: subjects.programId }).from(schema.exams).innerJoin(subjects, eq(schema.exams.subjectId, subjects.id))
        .where(and(eq(subjects.programId, user.programId), eq(subjects.level, user.level ?? 1), gte(schema.exams.at, new Date()))).orderBy(asc(schema.exams.at)).limit(1);
      const weakest = exam ? null : (await subjectScores(user)).at(-1);
      focus = exam ?? (weakest ? { id: weakest.id, name: weakest.name, programId: user.programId } : null);
    }
    if (!focus) return <Empty title="Choisis une matière pour ton partiel blanc" description="Un partiel blanc tire ses questions des quiz des cours d’une matière." href="/matieres" label="Voir les matières" />;
    const exitHref = "/reviser/partiels";
    // Un partiel avec ses propres fiches, corrigé sur le serveur
    if (params.source === "fiches") {
      const questions = cardsMockQuestions(await myCardsInSubject(user.id, focus.id));
      if (!questions.length) return <Empty title={`Il faut ${CARDS_MOCK_MIN} fiches de ${inSentence(focus.name)} aux réponses différentes`} description="Crée des fiches sur les cours de cette matière, puis reviens faire ton partiel." exitHref={exitHref} href={`/reviser/fiches/nouveau?matiere=${focus.id}`} label="Créer des fiches" />;
      return (
        <QuizRunner
          title={`Partiel blanc · ${focus.name} · mes fiches`} target={{ kind: "cards" }} exitHref={exitHref} account={user.id} prefs={prefs} showXp={false} timed
          againHref={`/reviser/seance?mode=partiel&matiere=${focus.id}&source=fiches`} notice="Questions tirées de tes fiches : le bon verso parmi ceux d’autres fiches"
          questions={questions.map((q) => ({ question: q.question, choices: q.choices, cardId: q.cardId, choiceIds: q.choiceIds }))}
        />
      );
    }
    const questions = await mockExamQuestions(user, focus.id, MOCK_MAX_QUESTIONS);
    if (questions.length < MOCK_MIN_QUESTIONS) return <MockHelp user={user} subject={focus} />;
    return (
      <QuizRunner
        title={`Partiel blanc · ${focus.name}`} target={{ kind: "mock", subjectId: focus.id }} exitHref={exitHref} account={user.id} prefs={prefs} showXp={playGame} timed notice="Questions générées par Campuss IA · à vérifier"
        questions={questions.flatMap((q) => (q.kind === "question" ? [{ question: q.question, choices: q.choices, docId: q.docId, index: q.index }] : []))}
      />
    );
  }

  const reversed = params.sens === "inverse";
  const scope = mode === "fiches" ? parseScope(params.paquet) : null;
  if (scope) {
    const ahead = params.tout === "1";
    const deck = await deckSession(user.id, scope, { ahead });
    const back = `/reviser/fiches?paquet=${scope}`;
    const name = deck.title ?? (scope === FREE_SCOPE ? "Fiches libres" : (await db.select({ title: schema.documents.title }).from(schema.documents).where(eq(schema.documents.id, scope)))[0]?.title) ?? "Paquet";
    if (!deck.items.length) {
      return ahead
        ? <Empty title="Ce paquet ne contient aucune fiche à réviser" exitHref={back} href={scope === FREE_SCOPE ? "/reviser/fiches/nouveau" : `/reviser/fiches/nouveau?cours=${scope}`} label="Créer des fiches" />
        : <Empty title={`« ${name} » est à jour`} description="Tes fiches reviendront au bon moment. Tu peux quand même les réviser en avance." exitHref={back} href={`/reviser/seance?mode=fiches&paquet=${scope}&tout=1${reversed ? "&sens=inverse" : ""}`} label="Réviser en avance" />;
    }
    const game = playGame ? await gameSnapshot(user.id) : null;
    return <SessionPlayer items={deck.items} game={game} account={user.id} prefs={prefs} reversed={reversed} exitHref={back} title={`${ahead ? "En avance" : "Séance"} · ${name}`} afterGood={<PublishInvite scope={scope} primary={false} />} />;
  }

  const fresh = Number(params.nouvelles);
  const questionsOnly = mode === "questions";
  const cardsOnly = mode === "fiches";
  const session = await todaySession(user, {
    subjectId: subject?.id,
    newCount: questionsOnly ? 0 : fresh > 0 ? Math.min(10, fresh) : undefined,
    questions: questionsOnly ? 5 : fresh > 0 ? 0 : undefined,
  });
  const items = cardsOnly ? session.items.filter((item) => item.kind === "card") : questionsOnly ? session.items.filter((item) => item.kind === "question") : fresh > 0 ? session.items.filter((item) => item.kind === "new") : session.items;
  // Pas d'écran « choisis un cours » ni de « rien à réviser » ; sans fiche, les cours tout de suite
  if (!items.length && fresh > 0) redirect("/reviser/fiches/nouveau");
  if (!items.length) {
    const { total } = await cardCounts(user.id);
    if (!total) redirect("/reviser/fiches/nouveau");
    return <Empty title={subject ? `Tes fiches de ${inSentence(subject.name)} sont à jour` : "Tes fiches sont à jour"} description="Elles reviendront au bon moment. En attendant, ajoute des fiches sur un autre cours ou revois un paquet en avance." href="/reviser/fiches/nouveau" label="Créer des fiches" secondary={{ href: "/reviser/fiches", label: "Voir mes paquets" }} />;
  }
  const game = playGame ? await gameSnapshot(user.id) : null;
  return (
    <SessionPlayer
      items={items} game={game} account={user.id} prefs={prefs} reversed={reversed}
      title={subject ? `Séance · ${subject.name}` : "Séance du jour"}
      moreHref={`/reviser/seance?nouvelles=5${subject ? `&matiere=${subject.id}` : ""}`}
    />
  );
}

function Empty({ title, description, href, label, exitHref = "/reviser", secondary }: { title: string; description?: string; href: string; label: string; exitHref?: string; secondary?: { href: string; label: string } }) {
  return (
    <SessionFrame exitHref={exitHref} title={title}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10">
        <EmptyState icon={/fiches|avance/.test(label) ? IconCards : label.includes("cours") ? IconSubjects : IconQuiz} title={title} description={description}
          action={<div className="flex flex-wrap justify-center gap-2"><Link href={href} className={buttonVariants()}>{label}</Link>{secondary && <Link href={secondary.href} className={buttonVariants({ variant: "outline" })}>{secondary.label}</Link>}</div>} className="w-full max-w-md" />
        <Link href={exitHref} className="text-sm text-muted-foreground hover:text-foreground">{exitHref === "/reviser" ? "Retour à Réviser" : exitHref === "/reviser/partiels" ? "Retour aux partiels" : "Retour aux fiches"}</Link>
      </div>
    </SessionFrame>
  );
}

type Viewer = Awaited<ReturnType<typeof requireUser>>;

/**
 * Pas assez de quiz pour un partiel blanc : dire pourquoi, puis trois issues claires —
 * générer les quiz avec Campuss IA, faire un partiel avec ses fiches, s'entraîner sur les sujets publiés —
 * et, s'il y en a, une autre matière déjà prête.
 */
async function MockHelp({ user, subject }: { user: Viewer; subject: { id: number; name: string } }) {
  const programSubjects = user.programId ? await db.select({ id: subjects.id, name: subjects.name, shortName: subjects.shortName }).from(subjects)
    .where(and(eq(subjects.programId, user.programId), eq(subjects.level, user.level ?? 1), isNull(subjects.archivedAt))).orderBy(asc(subjects.position)) : [];
  const [sources, missing, papers, cards, ai, byS] = await Promise.all([
    quizSources(user, subject.id), coursesWithoutQuiz(user, subject.id), examPapers(user, subject.id), myCardsInSubject(user.id, subject.id, 50), aiAvailable(),
    quizQuestionsBySubject(user, programSubjects.map((s) => s.id)),
  ]);
  const toGenerate = missing.filter((c) => c.quizStatus !== "pending");
  const pending = missing.length - toGenerate.length;
  const ready = programSubjects.filter((s) => s.id !== subject.id && (byS.get(s.id) ?? 0) >= MOCK_MIN_QUESTIONS);
  const distinctBacks = new Set(cards.map((c) => c.back.trim())).size;
  const name = inSentence(subject.name);
  return (
    <SessionFrame exitHref="/reviser/partiels" title={`Partiel blanc · ${subject.name}`}>
      <div className="mx-auto grid w-full max-w-2xl gap-8 py-8">
        <div className="grid gap-2">
          <h2 className="title text-balance">Pas encore assez de quiz en {name}</h2>
          <p className="text-pretty text-muted-foreground">{mockShortfall(sources, name)}</p>
        </div>
        <ol className="grid gap-4">
          <li className="grid gap-3 rounded-xl bg-card p-4 shadow-xs">
            <p className="font-semibold">Générer les quiz avec Campuss IA</p>
            {toGenerate.length > 0 && ai
              ? (
                <>
                  <p className="text-sm text-muted-foreground">Un quiz par cours, préparé une fois puis partagé avec toute ta promo. Cours concernés :</p>
                  <ul className="grid gap-1 text-sm">{toGenerate.slice(0, 6).map((c) => <li key={c.id}><Link href={`/d/${c.id}`} className="underline-offset-2 hover:underline">{c.title || "Sans titre"}</Link></li>)}</ul>
                  <QuizRequestButton subjectId={subject.id} count={Math.min(6, toGenerate.length)} />
                </>
              )
              : <p className="text-sm text-muted-foreground">{pending > 0 ? `Campuss IA prépare déjà ${pending} quiz : reviens dans quelques minutes.` : !ai ? "Campuss IA n’est pas disponible pour l’instant." : "Aucun cours publié de cette matière n’attend de quiz. Un cours relu et publié reçoit son quiz automatiquement."}</p>}
          </li>
          <li className="grid gap-3 rounded-xl bg-card p-4 shadow-xs">
            <p className="font-semibold">Faire un partiel avec mes fiches</p>
            <p className="text-sm text-muted-foreground">Le recto de chaque fiche devient une question, à résoudre parmi 4 réponses.</p>
            {distinctBacks >= CARDS_MOCK_MIN
              ? <Link href={`/reviser/seance?mode=partiel&matiere=${subject.id}&source=fiches`} className={buttonVariants({ variant: "outline" }) + " justify-self-start"}>Partiel avec mes {cards.length} fiches</Link>
              : <Link href={`/reviser/fiches/nouveau?matiere=${subject.id}`} className={buttonVariants({ variant: "outline" }) + " justify-self-start"}>Créer des fiches en {name}</Link>}
          </li>
          <li className="grid gap-3 rounded-xl bg-card p-4 shadow-xs">
            <p className="font-semibold">S’entraîner sur les sujets publiés</p>
            {papers.length
              ? <ul className="grid gap-1 text-sm">{papers.map((p) => <li key={p.id}><Link href={p.quizReady ? `/d/${p.id}/quiz` : `/d/${p.id}`} className="underline-offset-2 hover:underline">{p.title || "Sans titre"}{p.academicYear ? ` · ${p.academicYear}` : ""}</Link></li>)}</ul>
              : <p className="text-sm text-muted-foreground">Aucun sujet de partiel publié en {name} pour l’instant.</p>}
            <Link href="/reviser/partiels#sujets" className="justify-self-start text-sm text-link hover:underline">Tous les sujets pour s’entraîner</Link>
          </li>
        </ol>
        {ready.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Déjà prêt dans une autre matière :</p>
            <ul className="flex flex-wrap gap-2">{ready.map((s) => <li key={s.id}><Link href={`/reviser/seance?mode=partiel&matiere=${s.id}`} className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 text-sm font-semibold coarse:min-h-11">{s.shortName || s.name}</Link></li>)}</ul>
          </div>
        )}
      </div>
    </SessionFrame>
  );
}
