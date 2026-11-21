import { and, desc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { readableDocuments } from "@/lib/access";
import { adminSearch } from "@/lib/admin-search";
import { currentUser } from "@/lib/auth";
import { escapeLike, folded } from "@/lib/content-utils";
import { similarRequest } from "@/lib/course-requests";
import { db, schema } from "@/lib/db";
import { CATEGORIES } from "@/lib/db/categories";
import { friendsOf } from "@/lib/friends";
import { json } from "@/lib/http";
import { rateHit, rateLimited } from "@/lib/security";
import { guessSubject, MARK_END, MARK_START, searchType, shouldProposeRequest } from "@/lib/search-rules";
import { absoluteSemester, chosenParity, currentParity, SEMESTER_COOKIE, subjectsForSemester } from "@/lib/semester";

const { documents, favorites, programs, readingProgress, subjects } = schema;

type Hit = { href: string; title: string; hint: string };
// Les accents ne comptent pas : « economie » trouve « Économie »
const plain = (column: unknown) => sql`translate(lower(${column}), 'àâäáéèêëíîïóôöúùûüçœ', 'aaaaeeeeiiiooouuuuco')`;
const HEADLINE = `StartSel=${MARK_START},StopSel=${MARK_END},MaxWords=18,MinWords=8,MaxFragments=1,ShortWord=2`;

const hint = (category: keyof typeof CATEGORIES, subject: string | null) => [CATEGORIES[category], subject].filter(Boolean).join(" · ");

/**
 * Palette de recherche : mêmes droits que le reste du site, valeurs toujours en paramètres liés.
 * Sans texte : récents et favoris. Avec : matières, cours (titre), dans le texte (extrait), amis, et personnes pour l'admin.
 */
/** La recherche s'affiche à la frappe : large pour un usage normal, bas pour une extraction automatisée. */
const SEARCHES_PER_HOUR = 600;

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return json({ error: "Accès refusé" }, 403);
  // Les extraits renvoient du texte de cours : borné comme la lecture, contre une aspiration par la recherche
  const key = `search:${user.id}`;
  if (await rateLimited(key, SEARCHES_PER_HOUR, 60)) return json({ error: "Beaucoup de recherches en une heure. Réessaie dans un moment." }, 429);
  await rateHit(key);
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const type = searchType(params.get("type"));
  const subjectId = Number(params.get("matiere")) || null;
  const level = Number(request.cookies.get("campuss-annee")?.value) || user.level || 1;
  const [program] = user.programId ? await db.select({ name: programs.name }).from(programs).where(eq(programs.id, user.programId)) : [];
  const parity = user.programId ? chosenParity(undefined, request.cookies.get(SEMESTER_COOKIE)?.value, await currentParity({ programId: user.programId, level })) : 1;
  const semesterSubjects = user.programId ? await subjectsForSemester(user.programId, level, parity) : [];
  const context = {
    program: program ? `${program.name} L${level}` : "ta licence",
    term: `L${level} S${absoluteSemester(level, parity)}`,
    requestSubjects: semesterSubjects.map((s) => ({ id: s.id, name: s.name, shortName: s.shortName })),
    hints: user.prefs.hints ?? [],
  };

  if (q.length < 2) {
    const card = { id: documents.id, title: documents.title, category: documents.category, subject: subjects.shortName };
    const [recents, favs] = await Promise.all([
      db.select(card).from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id))
        .where(and(eq(readingProgress.userId, user.id), readableDocuments(user), isNull(documents.deletedAt))).orderBy(desc(readingProgress.updatedAt)).limit(4),
      db.select(card).from(favorites).innerJoin(documents, eq(favorites.documentId, documents.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id))
        .where(and(eq(favorites.userId, user.id), readableDocuments(user), isNull(documents.deletedAt))).orderBy(desc(favorites.at)).limit(4),
    ]);
    const hit = (d: (typeof recents)[number]): Hit => ({ href: `/d/${d.id}`, title: d.title || "Sans titre", hint: hint(d.category, d.subject) });
    return json({ ...context, recents: recents.map(hit), favorites: favs.filter((f) => !recents.some((r) => r.id === f.id)).map(hit), results: [] });
  }

  const needle = folded(q);
  const like = `%${escapeLike(needle)}%`;
  const inProgram = user.role === "admin" ? undefined : eq(documents.programId, user.programId ?? -1);
  const narrowed = and(readableDocuments(user), isNull(documents.deletedAt), inProgram, type ? eq(documents.category, type) : undefined, subjectId ? eq(documents.subjectId, subjectId) : undefined);
  const fields = { id: documents.id, title: documents.title, category: documents.category, subject: subjects.shortName };

  const [subjectRows, found, friends, people] = await Promise.all([
    subjectId ? [] : db.select({ id: subjects.id, name: subjects.name, level: subjects.level, semester: subjects.semester }).from(subjects)
      .where(and(user.role === "admin" ? undefined : eq(subjects.programId, user.programId ?? -1), isNull(subjects.archivedAt), or(sql`${plain(subjects.name)} like ${like}`, sql`${plain(subjects.shortName)} like ${like}`))).limit(4),
    db.select({ ...fields, titleHit: sql<boolean>`${plain(documents.title)} like ${like}`,
      snippet: sql<string>`ts_headline('french', left(coalesce(nullif(${documents.bodyMarkdown}, ''), ${documents.searchText}), 20000), websearch_to_tsquery('french', ${needle}), ${HEADLINE})` })
      .from(documents).leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .where(and(narrowed, or(sql`${documents.searchVector} @@ websearch_to_tsquery('french', ${needle})`, sql`${documents.searchText} ilike ${like} escape '\\'`)))
      .orderBy(desc(sql`${plain(documents.title)} like ${like}`), desc(documents.updatedAt)).limit(10),
    friendsOf(user.id).then((list) => list.filter((f) => folded(f.name).includes(needle)).slice(0, 4)),
    user.role === "admin" ? adminSearch(q).catch(() => []) : Promise.resolve([]),
  ]);
  // Fautes de frappe (« microeco ») : trigrammes sur le titre, si l'extension pg_trgm est installée
  const typos = found.length < 4 ? await db.select(fields).from(documents).leftJoin(subjects, eq(documents.subjectId, subjects.id))
    .where(and(narrowed, found.length ? notInArray(documents.id, found.map((f) => f.id)) : undefined, sql`word_similarity(${needle}, ${plain(documents.title)}) >= 0.45`))
    .orderBy(desc(sql`word_similarity(${needle}, ${plain(documents.title)})`)).limit(4).catch(() => []) : [];
  const docs: Hit[] = [...found.filter((d) => d.titleHit), ...typos].slice(0, 6).map((d) => ({ href: `/d/${d.id}`, title: d.title || "Sans titre", hint: hint(d.category, d.subject) }));
  const text = found.filter((d) => !d.titleHit).slice(0, 4).map((d) => ({ href: `/d/${d.id}`, title: d.title || "Sans titre", hint: hint(d.category, d.subject), snippet: d.snippet ?? "" }));
  const subjectHits: Hit[] = subjectRows.map((s) => ({ href: `/matieres/${s.id}`, title: s.name, hint: s.semester ? `S${s.semester}` : `L${s.level}` }));
  const total = subjectHits.length + docs.length + text.length;
  const propose = shouldProposeRequest(q, total) && context.requestSubjects.length > 0;
  const similar = propose ? await similarRequest(user, q) : null;
  return json({
    ...context,
    subjects: subjectHits, docs, text,
    friends: friends.map((f) => ({ href: `/u/${f.id}`, title: f.name, hint: "Ami" })),
    people: people.map((p) => ({ href: p.href, title: p.label, hint: p.hint })),
    propose, similar, guessed: propose ? guessSubject(q, context.requestSubjects, subjectId) : null,
    // Ancien format (tests, extensions) : matières puis cours
    results: [...subjectHits, ...docs, ...text.map(({ snippet, ...rest }) => { void snippet; return rest; })],
  });
}

// Rien n'est mis en cache : la réponse dépend du compte
export const dynamic = "force-dynamic";
