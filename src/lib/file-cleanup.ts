import "server-only";
import { asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { rebuildDocumentSearch } from "./file-jobs";
import { collectFileIds, strayObjects, unreferencedFiles } from "./orphan-files";
import { cardImageKey, deleteKeys, fileKey, listObjects, revisionKey } from "./s3";

const { annotations, auditLog, blogPosts, cardImages, docFiles, documents, revisionFiles, revisions, users } = schema;
const HOUR = 3_600_000;
// Un auteur peut proposer sa correction d'un cours publié plusieurs jours après y avoir ajouté une image, sans rien enregistrer entre-temps
const COURSE_GRACE = 7 * 24 * HOUR;
const GRACE = 24 * HOUR;
// Si le repérage des références se trompait un jour, les dégâts resteraient limités à une journée de ménage
const MAX_PER_KIND = 200;
const PAGE = 100;

const asText = (column: unknown) => sql<string | null>`${column}::text`;

/** Toutes les références, tous cours confondus : une image copiée d'un cours à l'autre garde l'adresse du premier. */
async function readReferences() {
  const referenced = new Set<string>();
  const updatedAt = new Map<string, Date>();
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const page = await db.select({ id: documents.id, cover: documents.coverFileId, updatedAt: documents.updatedAt, blocks: asText(documents.bodyBlocks), markdown: documents.bodyMarkdown, description: documents.description })
      .from(documents).where(gt(documents.id, after)).orderBy(asc(documents.id)).limit(PAGE);
    for (const doc of page) {
      updatedAt.set(doc.id, doc.updatedAt);
      for (const content of [doc.cover, doc.blocks, doc.markdown, doc.description]) collectFileIds(content, referenced);
    }
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }
  const pending = await db.select({ blocks: asText(revisions.bodyBlocks), markdown: revisions.bodyMarkdown }).from(revisions).where(eq(revisions.status, "pending"));
  for (const revision of pending) for (const content of [revision.blocks, revision.markdown]) collectFileIds(content, referenced);
  // Le texte de l'état Yjs est en clair dans ses octets : une image retirée puis rétablie par un autre garde son fichier
  const notes = await db.select({ state: schema.collabNotes.state }).from(schema.collabNotes).where(isNull(schema.collabNotes.closedAt));
  for (const note of notes) collectFileIds(note.state?.toString("latin1"), referenced);
  const posts = await db.select({ markdown: blogPosts.bodyMarkdown, blocks: asText(blogPosts.bodyBlocks), cover: blogPosts.coverFileId }).from(blogPosts);
  for (const post of posts) for (const content of [post.markdown, post.blocks, post.cover]) collectFileIds(content, referenced);
  return { referenced, updatedAt };
}

async function sweepCourseFiles(now: Date) {
  const { referenced, updatedAt } = await readReferences();
  const embedded = await db.select({ id: docFiles.id, documentId: docFiles.documentId, createdAt: docFiles.createdAt }).from(docFiles).where(eq(docFiles.embedded, true));
  const orphans = unreferencedFiles(embedded.map((file) => ({ ...file, lastActivity: updatedAt.get(file.documentId) ?? now })), referenced, now, COURSE_GRACE).slice(0, MAX_PER_KIND);
  if (!orphans.length) return 0;
  await db.delete(docFiles).where(inArray(docFiles.id, orphans.map((file) => file.id)));
  await deleteKeys(orphans.map((file) => fileKey(file.id)));
  for (const documentId of new Set(orphans.map((file) => file.documentId))) await rebuildDocumentSearch(documentId);
  return orphans.length;
}

/** Une photo envoyée pour une note jamais écrite, ou dont la note a disparu. */
async function sweepRevisionPhotos(now: Date) {
  const attached = await db.select({ id: annotations.photoId }).from(annotations).where(isNotNull(annotations.photoId));
  const photos = await db.select({ id: revisionFiles.id, createdAt: revisionFiles.createdAt }).from(revisionFiles);
  const orphans = unreferencedFiles(photos, new Set(attached.map((a) => a.id!.toLowerCase())), now, GRACE).slice(0, MAX_PER_KIND);
  if (!orphans.length) return 0;
  await db.delete(revisionFiles).where(inArray(revisionFiles.id, orphans.map((file) => file.id)));
  await deleteKeys(orphans.map((file) => revisionKey(file.id)));
  return orphans.length;
}

/** Image de fiche envoyée puis jamais gardée dans une fiche : délai d'une semaine, comme les images de cours. */
async function sweepCardImages(now: Date) {
  const { rows } = await db.execute<{ id: string }>(sql`
    select c.id from ${cardImages} c
    where c.created_at < ${new Date(now.getTime() - COURSE_GRACE)}
      and not exists (select 1 from flashcards f where f.front like '%/card-images/' || c.id::text || '%' or f.back like '%/card-images/' || c.id::text || '%')
    limit ${MAX_PER_KIND}`);
  const orphans = rows.map((row) => row.id);
  if (!orphans.length) return 0;
  await db.delete(cardImages).where(inArray(cardImages.id, orphans));
  await deleteKeys(orphans.map(cardImageKey));
  return orphans.length;
}

/** Les objets restés dans le stockage : suppressions anciennes qui n'effaçaient que la ligne, ou panne du stockage. */
async function sweepStrayObjects(now: Date) {
  // Liste d'abord, base ensuite : une ligne créée pendant le parcours est bien vue
  const listed = await Promise.all(["files/", "revision/", "avatars/"].map((prefix) => listObjects(prefix)));
  const known = async (rows: Promise<{ id: string | null }[]>) => new Set((await rows).flatMap((row) => row.id?.split("/").pop()?.toLowerCase() ?? []));
  const [files, photos, avatars] = await Promise.all([
    known(db.select({ id: docFiles.id }).from(docFiles)),
    known(db.select({ id: revisionFiles.id }).from(revisionFiles)),
    known(db.select({ id: users.avatarKey }).from(users).where(isNotNull(users.avatarKey))),
  ]);
  const keys = [
    ...strayObjects(listed[0], "files/", files, now, GRACE),
    ...strayObjects(listed[1], "revision/", photos, now, GRACE),
    ...strayObjects(listed[2], "avatars/", avatars, now, GRACE),
  ].slice(0, MAX_PER_KIND);
  if (keys.length) await deleteKeys(keys);
  return keys.length;
}

export async function sweepOrphanFiles(now = new Date()) {
  const course = await sweepCourseFiles(now);
  const photos = await sweepRevisionPhotos(now) + await sweepCardImages(now);
  // Après les deux autres : ce qu'ils auraient laissé derrière eux est rattrapé dans la foulée
  const objects = await sweepStrayObjects(now);
  if (course + photos + objects === 0) return;
  await db.insert(auditLog).values({ actor: "système", action: "fichiers_orphelins_supprimés", target: `images de cours : ${course}, photos de révision : ${photos}, objets sans ligne : ${objects}` });
}
