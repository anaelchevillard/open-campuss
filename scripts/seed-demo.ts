/**
 * Jeu de démonstration : une licence fictive complète (L1 à L3), ses cours, ses révisions et quelques camarades.
 * Sert à l'instance de démonstration (remise à zéro chaque nuit) et aux captures de la présentation.
 * BASE JETABLE SEULEMENT : le script refuse de tourner sans DEMO_SEED=1 et sur une base qui contient déjà des comptes.
 * Noms, cours, partiels et chiffres sont fictifs. Aucun appel à l'IA : quiz et fiches sont écrits à la main.
 *
 *   DEMO_SEED=1 DATABASE_URL=postgresql://… npx tsx scripts/seed-demo.ts      (ou : npm run demo:seed)
 */
import { hash } from "@node-rs/argon2";
import { count, eq, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { TERMS_VERSION } from "../src/lib/db/categories";
import * as schema from "../src/lib/db/schema";
import { courseText } from "../src/lib/course";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../src/lib/demo";
import { COURSES, DECKS, QUIZZES, SUBJECTS } from "./seed-demo-data";

export { DEMO_EMAIL, DEMO_PASSWORD };

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const dayKey = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

// Année universitaire en cours (septembre à août) : les cours datent de cette année, les annales des précédentes
const today = new Date();
const startYear = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
const yearOf = (back: number) => `${startYear - back}-${startYear - back + 1}`;

/** [nom, adresse, année, rôle] : Lina, la première, est le compte de démonstration. */
const PEOPLE = [
  ["Lina Morel", DEMO_EMAIL, 1, "member"],
  ["Hugo Renaud", "hugo_renaud@etu.exemple.fr", 1, "delegate"],
  ["Inès Benali", "ines_benali@etu.exemple.fr", 1, "member"],
  ["Théo Garnier", "theo_garnier@etu.exemple.fr", 1, "member"],
  ["Sarah Lefèvre", "sarah_lefevre@etu.exemple.fr", 1, "member"],
  ["Maël Dupuis", "mael_dupuis@etu.exemple.fr", 2, "member"],
  ["Chloé Martin", "chloe_martin@etu.exemple.fr", 2, "contributor"],
  ["Yanis Haddad", "yanis_haddad@etu.exemple.fr", 3, "member"],
  ["Emma Rousseau", "emma_rousseau@etu.exemple.fr", 3, "delegate"],
] as const;

async function main() {
  if (process.env.DEMO_SEED !== "1") throw new Error("Jeu de démonstration : base jetable seulement (DEMO_SEED=1).");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const s = schema;

  // Garde-fou : une base qui a déjà des comptes autres que l'administrateur initial n'est pas jetable
  const [{ n }] = await db.select({ n: count() }).from(s.users).where(ne(s.users.role, "admin"));
  if (n > 0) throw new Error(`La base contient déjà ${n} comptes : jeu de démonstration refusé.`);

  const [eco] = await db.insert(s.programs).values({ slug: "economie", name: "Économie et gestion", active: true, position: 0 })
    .onConflictDoUpdate({ target: s.programs.slug, set: { active: true } }).returning();
  for (const [i, [slug, name]] of [["droit", "Droit"], ["lea", "LEA"], ["aes", "AES"]].entries()) {
    await db.insert(s.programs).values({ slug, name, active: false, position: i + 1 }).onConflictDoNothing();
  }
  // Les migrations créent des matières annuelles pour cette licence : remplacées ici par celles du jeu, semestre par semestre
  await db.delete(s.subjects).where(eq(s.subjects.programId, eco.id));
  const subjects = await db.insert(s.subjects).values(SUBJECTS.map(([name, shortName, semester], position) => ({
    programId: eco.id, level: Math.ceil(semester / 2), semester, name, shortName, position,
  }))).returning();

  const passwordHash = await hash(DEMO_PASSWORD);
  const people = await db.insert(s.users).values(PEOPLE.map(([name, email, level, role], i) => ({
    name, email, passwordHash, status: "active" as const, role, programId: eco.id, level,
    termsVersion: TERMS_VERSION, termsAcceptedAt: daysAgo(40), onboardedAt: daysAgo(40),
    trackingConsent: "no", createdAt: daysAgo(70 - i * 5), lastLoginAt: daysAgo(i % 4),
    prefs: { checklistDismissed: true, hints: ["annoter", "favoris-filtre", "palette-raccourcis"], intent: "exam" as const },
    bio: i === 0 ? "L1 éco-gestion. Fiches et cartes avant tout." : "",
  }))).returning();
  const [lina] = people;
  const friends = people.slice(1, 4);

  const docs = await db.insert(s.documents).values(COURSES.map((c) => {
    const subject = subjects[c.subject];
    const published = !c.draft;
    return {
      title: c.title, category: c.category, programId: eco.id, subjectId: subject.id, chapter: c.chapter || null,
      kind: "editor", bodyMarkdown: c.body, bodyText: courseText(c.body), searchText: `${c.title} ${courseText(c.body)}`,
      published, publishedAt: published ? daysAgo(c.ago) : null, reviewedAt: published ? daysAgo(c.ago) : null, reviewedBy: published ? people[1].id : null,
      rightsBasis: c.category === "partiel" ? "public" : "own_notes", academicYear: yearOf(c.yearsBack ?? 0), semester: subject.semester,
      teacherName: c.teacher ?? "", createdBy: people[c.author].id, createdAt: daysAgo(c.ago + 1), updatedAt: daysAgo(c.ago),
    };
  })).returning();
  const docOf = (key: string) => {
    const i = COURSES.findIndex((c) => c.key === key);
    if (i < 0) throw new Error(`cours inconnu : ${key}`);
    return docs[i];
  };

  // Amis de Lina : trois acceptés, une demande reçue, une envoyée
  await db.insert(s.friendships).values([
    ...friends.map((p, i) => ({ requesterId: p.id, addresseeId: lina.id, status: "accepted" as const, acceptedAt: daysAgo(20 + i) })),
    { requesterId: people[4].id, addresseeId: lina.id, status: "pending" as const, createdAt: daysAgo(1) },
    { requesterId: lina.id, addresseeId: people[6].id, status: "pending" as const, createdAt: daysAgo(3) },
  ]);

  // Lecture en cours, favoris, « révisé », mercis et notes
  const reading: [string, number][] = [["offre-demande", 64], ["stats-descriptive", 30], ["pib", 100], ["derivees", 12], ["fiche-elasticites", 100]];
  await db.insert(s.readingProgress).values(reading.map(([key, percent], i) => ({ userId: lina.id, documentId: docOf(key).id, percent, updatedAt: daysAgo(i), createdAt: daysAgo(i + 3) })));
  await db.insert(s.favorites).values(["offre-demande", "fiche-elasticites", "annale-micro"].map((key) => ({ userId: lina.id, documentId: docOf(key).id })));
  await db.insert(s.revised).values(["pib", "fiche-elasticites"].map((key, i) => ({ userId: lina.id, documentId: docOf(key).id, at: daysAgo(i + 2) })));
  for (const [i, doc] of docs.entries()) {
    if (!doc.published) continue;
    const readers = people.filter((p) => p.id !== doc.createdBy).slice(0, 3 + (i % 4));
    await db.insert(s.thanks).values(readers.map((p) => ({ userId: p.id, documentId: doc.id }))).onConflictDoNothing();
    await db.insert(s.documentRatings).values(readers.map((p, k) => ({ userId: p.id, documentId: doc.id, stars: k % 4 === 3 ? 4 : 5 }))).onConflictDoNothing();
  }

  // Quiz et fiches générées, écrits à la main : prêts sans IA
  for (const [key, questions] of Object.entries(QUIZZES)) {
    await db.insert(s.quizzes).values({ documentId: docOf(key).id, questions, model: "démonstration" });
  }
  await db.update(s.documents).set({ quizStatus: "ready" }).where(inArray(s.documents.id, Object.keys(QUIZZES).map((key) => docOf(key).id)));
  for (const [key, cards] of Object.entries(DECKS)) {
    await db.insert(s.memoDecks).values({ documentId: docOf(key).id, cards, model: "démonstration" });
  }
  await db.insert(s.quizAttempts).values([
    { userId: lina.id, documentId: docOf("offre-demande").id, score: 3, total: 4, at: daysAgo(6) },
    { userId: lina.id, documentId: docOf("offre-demande").id, score: 4, total: 4, at: daysAgo(2) },
    { userId: lina.id, documentId: docOf("stats-descriptive").id, score: 2, total: 3, at: daysAgo(1), mode: "flash" as const },
    { userId: people[2].id, documentId: docOf("offre-demande").id, score: 3, total: 4, at: daysAgo(3) },
  ]);

  // Cartes de Lina, tirées des fiches de ses cours : une partie à revoir aujourd'hui, le reste plus tard
  const lineCards = Object.entries(DECKS).flatMap(([key, deck]) => deck.map((card) => ({ key, ...card })));
  const cards = await db.insert(s.flashcards).values(lineCards.map((c, i) => {
    const fresh = i % 5 === 0;
    return {
      userId: lina.id, documentId: docOf(c.key).id, front: c.front, back: c.back,
      dueAt: daysAgo(i % 3 === 0 ? 0.2 : -1 - (i % 6)), state: fresh ? 0 : 2, reps: fresh ? 0 : 1 + (i % 4),
      stability: fresh ? 0 : 2 + (i % 7), difficulty: fresh ? 0 : 4 + (i % 3), intervalDays: fresh ? 0 : 1 + (i % 6),
      lastReviewedAt: fresh ? null : daysAgo(1 + (i % 9)), createdAt: daysAgo(25 - (i % 10)),
    };
  })).returning();
  // Historique des notes : alimente les statistiques de révision (régularité, réussite)
  await db.insert(s.cardReviews).values(cards.filter((c) => c.reps > 0).flatMap((card, i) =>
    Array.from({ length: card.reps }, (_, k) => ({ userId: lina.id, cardId: card.id, grade: (i + k) % 5 === 0 ? 1 : 3, ms: 4000 + ((i * 7 + k) % 9) * 1000, at: daysAgo(2 + k * 3 + (i % 4)) }))));

  // Paquets de cartes : celui de Lina (partagé avec ses amis) et un paquet public de Hugo, copié par d'autres
  const stats = docOf("stats-descriptive");
  await db.insert(s.flashcards).values(DECKS["stats-descriptive"].map((c) => ({ userId: people[1].id, documentId: stats.id, front: c.front, back: c.back })));
  const [, hugoPack] = await db.insert(s.memoPacks).values([
    { ownerId: lina.id, scope: docOf("offre-demande").id, documentId: docOf("offre-demande").id, title: "Offre, demande et élasticités", programId: eco.id, friends: true },
    { ownerId: people[1].id, scope: stats.id, documentId: stats.id, title: "Statistique descriptive : l’essentiel", programId: eco.id, public: true, copies: 2 },
  ]).returning();
  await db.insert(s.memoPackCopies).values([people[2].id, people[3].id].map((userId) => ({ packId: hugoPack.id, userId })));

  // Partiels et contrôles à venir, pour le compte à rebours de l'accueil
  const subjectOf = (shortName: string) => {
    const found = subjects.find((x) => x.shortName === shortName);
    if (!found) throw new Error(`matière inconnue : ${shortName}`);
    return found;
  };
  await db.insert(s.exams).values([
    { subjectId: subjectOf("Stats").id, title: "Partiel de statistiques", at: new Date(Date.now() + 12 * DAY), place: "Amphi A", createdBy: people[1].id },
    { subjectId: subjectOf("Micro").id, title: "Partiel de microéconomie", at: new Date(Date.now() + 19 * DAY), place: "Amphi B", createdBy: people[1].id },
    { subjectId: subjectOf("Maths").id, title: "Contrôle continu de mathématiques", at: new Date(Date.now() + 6 * DAY), place: "Salle 104", kind: "cc" as const, createdBy: people[1].id },
    { subjectId: subjectOf("Économétrie").id, title: "Partiel d’économétrie", at: new Date(Date.now() + 15 * DAY), place: "Amphi C", createdBy: people[6].id },
  ]);

  // Régularité : six semaines de révision, deux jours de pause par semaine ; quelques amis aussi
  const studied = Array.from({ length: 42 }, (_, i) => i).filter((i) => i % 7 !== 5 && i % 7 !== 6);
  await db.insert(s.studyDays).values(studied.map((i) => ({ userId: lina.id, day: dayKey(i), cards: 12 + ((i * 7) % 15), xp: 40 + i, questions: 6, correct: 4 + (i % 3), seconds: 900 + i * 30 })));
  for (const p of friends) {
    await db.insert(s.studyDays).values([0, 1, 2, 3, 5].map((i) => ({ userId: p.id, day: dayKey(i), cards: 10 + i, xp: 30 + i * 3, questions: 4, correct: 3, seconds: 700 }))).onConflictDoNothing();
  }

  // Annotations de Lina : surlignages et notes en marge sur deux cours
  const annotate = async (key: string, marks: { quote: string; kind: "hl" | "note"; color?: string; note?: string }[]) => {
    const doc = docOf(key);
    const [space] = await db.insert(s.revisionSpaces).values({ documentId: doc.id, ownerId: lina.id }).returning();
    const text = doc.bodyText ?? "";
    await db.insert(s.annotations).values(marks.map((m) => {
      const start = text.indexOf(m.quote);
      if (start < 0) throw new Error(`citation absente de « ${doc.title} » : ${m.quote}`);
      const end = start + m.quote.length;
      return { spaceId: space.id, authorId: lina.id, kind: m.kind, color: m.color ?? "yellow", start, end, quote: m.quote, prefix: text.slice(Math.max(0, start - 30), start), suffix: text.slice(end, end + 30), note: m.note };
    }));
  };
  await annotate("offre-demande", [
    { quote: "quantité demandée égale la quantité offerte", kind: "hl" },
    { quote: "quantité demandée égale la quantité offerte", kind: "note", note: "Tombé au partiel l’an dernier : savoir le tracer." },
    { quote: "Effet revenu", kind: "hl", color: "green" },
  ]);
  await annotate("stats-descriptive", [
    { quote: "sensible aux valeurs extrêmes", kind: "hl", color: "pink" },
    { quote: "partage la série en deux moitiés", kind: "note", note: "Médiane = robuste. À citer dans la discussion." },
  ]);

  // Questions sous les cours, avec réponses
  const ask = async (key: string, author: number, body: string, answers: [number, string, boolean?][]) => {
    const doc = docOf(key);
    const [question] = await db.insert(s.qaPosts).values({ documentId: doc.id, authorId: people[author].id, body, createdAt: daysAgo(4) }).returning();
    await db.insert(s.qaPosts).values(answers.map(([who, text, accepted], i) => ({ documentId: doc.id, parentId: question.id, authorId: people[who].id, body: text, accepted: Boolean(accepted), createdAt: daysAgo(3 - i) })));
  };
  await ask("offre-demande", 3, "Pourquoi la courbe de demande est-elle décroissante même pour un bien de première nécessité ?", [
    [1, "Elle reste décroissante, mais très pentue : la demande est peu élastique. L’effet revenu joue quand même.", true],
    [0, "Le prof a pris l’exemple du pain en TD, c’est dans le corrigé."],
  ]);
  await ask("stats-descriptive", 0, "Pour l’écart-type, on divise par n ou par n − 1 au partiel ?", [[2, "Par n en statistique descriptive ; n − 1 arrive en L2 avec l’estimation.", true]]);
  await ask("pib", 4, "Les exportations nettes peuvent-elles être négatives ?", [[1, "Oui, quand on importe plus qu’on n’exporte : elles réduisent alors le PIB côté dépenses."]]);

  // Notifications de Lina : de quoi remplir la cloche sans attendre
  await db.insert(s.notifications).values([
    { userId: lina.id, kind: "friend", title: `${people[4].name} veut être ton amie`, body: "Accepte pour réviser ensemble.", href: "/amis", createdAt: daysAgo(1) },
    { userId: lina.id, kind: "qa_reply", title: `${people[2].name} t’a répondu`, body: `${stats.title} : par n en statistique descriptive…`, href: `/d/${stats.id}`, createdAt: daysAgo(2) },
    { userId: lina.id, kind: "published", title: "Ton cours est publié", body: docOf("fiche-elasticites").title, href: `/d/${docOf("fiche-elasticites").id}`, readAt: daysAgo(4), createdAt: daysAgo(5) },
    { userId: lina.id, kind: "other", title: "Partiel de statistiques dans 12 jours", body: "Tes cartes de statistiques t’attendent.", href: "/reviser", readAt: daysAgo(1), createdAt: daysAgo(2) },
  ]);

  await pool.end();
  console.log(`Jeu de démonstration prêt : ${people.length} comptes, ${subjects.length} matières, ${docs.length} cours, ${cards.length} cartes. Connexion : ${DEMO_EMAIL}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
