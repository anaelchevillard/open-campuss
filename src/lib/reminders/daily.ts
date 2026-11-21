import "server-only";
import { and, count, countDistinct, desc, eq, gt, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { countByCategory } from "../category-counts";
import { db, schema } from "../db";
import { env } from "../env";
import { queueMail } from "../mail";
import { takeDailySlot } from "../notification-state";
import { deliveriesSettled, notify } from "../notify";
import { unsubscribeToken } from "../security";
import { parisDay, parisHour } from "./calendar";
import { weeklyReaders } from "./readers";
import { cardsDueNotification, shouldRemindCards } from "./cards-due";
import { EXAM_SERIES_HORIZON_DAYS, examNotification, examReminderDay } from "./exam-soon";
import { crossedThreshold, impactNotification } from "./impact";
import { newCourseNotifications, type NewDoc } from "./new-course";
import { followNotification } from "../people-rules";
import { shortName } from "../user-name-rules";
import { weeklyDigest, weeklyDue } from "./weekly-digest";
import { HOME } from "@/lib/home";

const { userHabits } = schema;
const { documents, docAuthors, exams, flashcards, impactMilestones, notificationState, notifications, profileFollows, readingProgress, scheduledRuns, subjectFollows, subjects, users } = schema;

const RUN_NAME = "daily-reminders";
// En fin d'après-midi, quand on peut encore réviser ; jamais la nuit
const DAILY_HOUR = 17;
const DAY = 86_400_000;

const activeStudents = async () => (await db.select({ id: users.id, programId: users.programId, level: users.level, role: users.role }).from(users).where(and(eq(users.status, "active"), ne(users.role, "teacher"))))
  .flatMap((u) => (u.programId && u.level ? [{ id: u.id, programId: u.programId, level: u.level }] : []));

type Students = Awaited<ReturnType<typeof activeStudents>>;

async function remindExams(students: Students, now: Date) {
  const soon = await db.select({ id: exams.id, title: exams.title, place: exams.place, kind: exams.kind, at: exams.at, subject: subjects.shortName, programId: subjects.programId, level: subjects.level }).from(exams).innerJoin(subjects, eq(exams.subjectId, subjects.id))
    .where(and(gt(exams.at, now), lte(exams.at, new Date(now.getTime() + EXAM_SERIES_HORIZON_DAYS * DAY))));
  const due = soon.flatMap((exam) => { const days = examReminderDay(exam.at, now); return days === null ? [] : [{ exam, days }]; });
  if (!due.length) return;
  const muted = await db.select({ userId: schema.examSeriesMutes.userId, examId: schema.examSeriesMutes.examId }).from(schema.examSeriesMutes).where(inArray(schema.examSeriesMutes.examId, due.map((d) => d.exam.id)));
  const off = new Set(muted.map((m) => `${m.userId}:${m.examId}`));
  for (const { exam, days } of due) {
    for (const student of students) if (student.programId === exam.programId && student.level === exam.level && !off.has(`${student.id}:${exam.id}`)) await notify(student.id, examNotification(exam, days));
  }
}

/** Fiches dues : à 17 h, sauf pour qui a choisi son heure (Paramètres › Révision), prévenu à cette heure-là. */
async function remindCards(now: Date, hour: number | null = null) {
  const chosen = hour === null ? isNull(userHabits.reminderHour) : eq(userHabits.reminderHour, hour);
  const due = await db.select({ userId: flashcards.userId, n: count() }).from(flashcards).innerJoin(users, eq(flashcards.userId, users.id))
    .leftJoin(userHabits, eq(userHabits.userId, users.id))
    .where(and(lte(flashcards.dueAt, now), isNull(flashcards.suspendedAt), eq(users.status, "active"), chosen)).groupBy(flashcards.userId);
  if (!due.length) return;
  const history = await db.selectDistinctOn([notifications.userId], { userId: notifications.userId, createdAt: notifications.createdAt, readAt: notifications.readAt }).from(notifications)
    .where(eq(notifications.kind, "cards_due")).orderBy(notifications.userId, desc(notifications.createdAt));
  const last = new Map(history.map((row) => [row.userId, row]));
  for (const { userId, n } of due) {
    if (shouldRemindCards(n, last.get(userId) ?? null, now)) await notify(userId, { ...cardsDueNotification(n), dedupeKey: `cards:${parisDay(now)}` });
  }
}

/** Les cours publiés pour la première fois depuis une date, quelle que soit la manière dont ils l'ont été. */
async function publishedSince(since: Date) {
  const rows = await db.select({ id: documents.id, title: documents.title, category: documents.category, createdBy: documents.createdBy, programId: documents.programId, subjectId: subjects.id, subject: subjects.shortName, level: subjects.level })
    .from(documents).innerJoin(subjects, eq(documents.subjectId, subjects.id))
    .where(and(eq(documents.published, true), isNull(documents.deletedAt), eq(documents.hiddenByReports, false), gt(documents.publishedAt, since)));
  const coauthors = rows.length ? await db.select().from(docAuthors).where(inArray(docAuthors.documentId, rows.map((row) => row.id))) : [];
  return rows.map(({ createdBy, ...row }): NewDoc => ({ ...row, authors: [...(createdBy ? [createdBy] : []), ...coauthors.filter((c) => c.documentId === row.id).map((c) => c.userId)] }));
}

async function remindNewCourses(students: Students, since: Date, now: Date) {
  const docs = await publishedSince(since);
  if (!docs.length) return;
  for (const student of students) for (const notification of newCourseNotifications(docs, student, parisDay(now))) await notify(student.id, notification);
  await remindFollows(students, docs, now);
}

/** Abonnements (profils et matières) : un rappel par jour au plus, après celui des matières, sans redire les mêmes cours. */
async function remindFollows(students: Students, docs: NewDoc[], now: Date) {
  const authors = [...new Set(docs.flatMap((doc) => doc.authors))];
  const [people, topics, names] = await Promise.all([
    authors.length ? db.select().from(profileFollows).where(inArray(profileFollows.followedId, authors)) : Promise.resolve([]),
    db.select().from(subjectFollows).where(inArray(subjectFollows.subjectId, [...new Set(docs.map((doc) => doc.subjectId))])),
    authors.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authors)) : Promise.resolve([]),
  ]);
  if (!people.length && !topics.length) return;
  // Le nom court seulement : la notification ne sait pas si l'auteur est un ami
  const authorName = (id: string) => { const person = names.find((n) => n.id === id); return person ? shortName(person.name) : null; };
  const day = parisDay(now);
  for (const student of students) {
    const follows = { people: new Set(people.filter((f) => f.followerId === student.id).map((f) => f.followedId)), subjects: new Set(topics.filter((f) => f.userId === student.id).map((f) => f.subjectId)) };
    if (!follows.people.size && !follows.subjects.size) continue;
    const already = new Set(docs.filter((doc) => doc.programId === student.programId && doc.level === student.level).map((doc) => doc.id));
    const notification = followNotification(docs, follows, student, already, day, authorName);
    if (notification) await notify(student.id, notification);
  }
}

async function authorsByDocument(documentIds: string[]) {
  const rows = documentIds.length ? await db.select().from(docAuthors).where(inArray(docAuthors.documentId, documentIds)) : [];
  return (id: string) => rows.filter((row) => row.documentId === id).map((row) => row.userId);
}

async function remindImpact() {
  const readers = await db.select({ id: documents.id, title: documents.title, createdBy: documents.createdBy, readers: countDistinct(readingProgress.userId), announced: sql<number>`coalesce(${impactMilestones.threshold}, 0)` })
    .from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id)).leftJoin(impactMilestones, eq(impactMilestones.documentId, documents.id))
    .where(and(eq(documents.published, true), isNull(documents.deletedAt), isNotNull(documents.createdBy), sql`${readingProgress.userId} <> ${documents.createdBy}`, sql`not exists (select 1 from ${docAuthors} where ${docAuthors.documentId} = ${documents.id} and ${docAuthors.userId} = ${readingProgress.userId})`))
    .groupBy(documents.id, documents.title, documents.createdBy, impactMilestones.threshold);
  const crossed = readers.flatMap((doc) => { const threshold = crossedThreshold(doc.readers, doc.announced); return threshold ? [{ ...doc, threshold }] : []; });
  const coauthors = await authorsByDocument(crossed.map((doc) => doc.id));
  for (const doc of crossed) {
    for (const author of new Set([doc.createdBy!, ...coauthors(doc.id)])) await notify(author, impactNotification(doc, doc.threshold));
    await db.insert(impactMilestones).values({ documentId: doc.id, threshold: doc.threshold }).onConflictDoUpdate({ target: impactMilestones.documentId, set: { threshold: doc.threshold } });
  }
}

async function sendWeeklyMails(now: Date) {
  if (!env.smtpEnabled) return;
  const people = await db.select({ id: users.id, email: users.email, name: users.name, programId: users.programId, level: users.level, role: users.role, weeklyMail: notificationState.weeklyMail, lastSent: notificationState.weeklyMailAt })
    .from(users).leftJoin(notificationState, eq(notificationState.userId, users.id)).where(eq(users.status, "active"));
  const fresh = await publishedSince(new Date(now.getTime() - 7 * DAY));
  for (const person of people) {
    if (person.weeklyMail === false || !weeklyDue(person.lastSent, now)) continue;
    const isStudent = person.role !== "teacher" && person.programId && person.level;
    const [[due], [nextExam], impact] = await Promise.all([
      db.select({ n: count() }).from(flashcards).where(and(eq(flashcards.userId, person.id), lte(flashcards.dueAt, now), isNull(flashcards.suspendedAt))),
      isStudent ? db.select({ subject: subjects.shortName, at: exams.at, kind: exams.kind }).from(exams).innerJoin(subjects, eq(exams.subjectId, subjects.id)).where(and(gt(exams.at, now), eq(subjects.programId, person.programId!), eq(subjects.level, person.level!))).orderBy(exams.at).limit(1) : [],
      weeklyReaders(person.id),
    ]);
    const counts = new Map<string, { category: string }[]>();
    if (isStudent) for (const doc of fresh) if (doc.programId === person.programId && doc.level === person.level && !doc.authors.includes(person.id)) counts.set(doc.subject, [...(counts.get(doc.subject) ?? []), doc]);
    const id = crypto.randomUUID();
    const digest = weeklyDigest({
      name: person.name, dueCards: due.n, nextExam: nextExam ?? null, newCourses: [...counts].map(([subject, docs]) => ({ subject, counts: countByCategory(docs) })), impact,
    }, { open: `/notifications/ouvrir/${id}` }, now);
    // Rien à dire : pas de mail. Rappel du jour déjà parti : le résumé attend demain.
    if (!digest || !(await takeDailySlot(person.id, now))) continue;
    await queueMail(person.email, digest.content, { category: "weekly", unsubscribePath: `/api/desabonnement/${unsubscribeToken(person.id, "weekly")}` });
    await db.insert(notifications).values({ id, userId: person.id, kind: "weekly", title: "Ton résumé de la semaine", body: digest.summary, href: HOME, pushedAt: now, readAt: now, dedupeKey: `weekly:${parisDay(now)}` }).onConflictDoNothing();
    await db.insert(notificationState).values({ userId: person.id, weeklyMailAt: now }).onConflictDoUpdate({ target: notificationState.userId, set: { weeklyMailAt: now } });
  }
}

/** Une fois par jour. L'ordre compte : seul le premier rappel de la journée part en push, le partiel passe donc avant le reste. */
export async function runDailyReminders(now = new Date()) {
  if (parisHour(now) < DAILY_HOUR) return;
  const [previous] = await db.select().from(scheduledRuns).where(eq(scheduledRuns.name, RUN_NAME));
  const day = parisDay(now);
  if (previous?.day === day) return;
  const students = await activeStudents();
  await remindExams(students, now);
  await remindCards(now);
  await remindNewCourses(students, previous?.at ?? new Date(now.getTime() - DAY), now);
  await remindImpact();
  await deliveriesSettled();
  await sendWeeklyMails(now);
  await db.insert(scheduledRuns).values({ name: RUN_NAME, day, at: now }).onConflictDoUpdate({ target: scheduledRuns.name, set: { day, at: now } });
}

/** Le rappel à l'heure choisie (7 h à 22 h) : la clé du jour empêche un second envoi. */
export async function runChosenHourReminders(now = new Date()) {
  const hour = parisHour(now);
  if (hour < 7 || hour > 22) return;
  await remindCards(now, hour);
}
