import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { attachmentKeys, baseKey, DRIVE_PREFIX, driveBase, driveMarkdown, referencedFiles, uniqueBase } from "./drive-path";
import { env } from "./env";
import { copyObject, deleteKey, fileKey, listKeys, putObject } from "./s3";

const { documents, docFiles, driveCopies, programs, subjects } = schema;
const PER_ROUND = 20;

/**
 * Comparer l'état voulu à ce qui est écrit couvre toutes les voies (publication, correction acceptée, retrait,
 * signalements, suppression, compte supprimé), rattrape un MinIO absent et reprend les cours déjà publiés.
 * L'empreinte se calcule côté base : le texte des cours ne remonte pas en mémoire pour rien.
 */
async function wanted() {
  const { rows } = await db.execute<{ id: string; fingerprint: string }>(sql`
    select d.id, md5(concat_ws(E'\x1f', '1', d.title, d.description, d.kind, coalesce(d.body_markdown, d.body_text), d.academic_year, p.name, s.name, s.level::text, f.files)) as fingerprint
    from documents d join programs p on p.id = d.program_id left join subjects s on s.id = d.subject_id
    left join lateral (select string_agg(x.id::text || ':' || x.filename, ',' order by x.id) as files from doc_files x where x.document_id = d.id and x.scan_status in ('clean', 'skipped')) f on true
    where d.published and not d.hidden_by_reports and d.deleted_at is null
    order by d.created_at, d.id`);
  return rows;
}

const keysOf = (copy: { base: string; files: Record<string, string> }) => [`${copy.base}.md`, ...Object.values(copy.files)];

async function remove(copy: typeof driveCopies.$inferSelect) {
  for (const key of keysOf(copy)) await deleteKey(key);
  await db.delete(driveCopies).where(eq(driveCopies.documentId, copy.documentId));
}

async function write(documentId: string, fingerprint: string, previous: typeof driveCopies.$inferSelect | undefined, taken: Set<string>) {
  const [row] = await db.select({ doc: documents, program: programs.name, subject: subjects.name, level: subjects.level }).from(documents)
    .innerJoin(programs, eq(documents.programId, programs.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id)).where(eq(documents.id, documentId));
  if (!row) return;
  const { doc } = row;
  const body = doc.bodyMarkdown ?? doc.bodyText;
  const place = { program: row.program, level: row.level, subject: row.subject, title: doc.title };
  const base = uniqueBase(driveBase(place), doc.id, taken);
  taken.add(baseKey(base));
  // Une image restée dans le cours mais retirée du texte n'a rien à faire sur le Drive
  const used = referencedFiles(body);
  const files = (await db.select().from(docFiles).where(eq(docFiles.documentId, doc.id)).orderBy(docFiles.createdAt, docFiles.id))
    .filter((file) => ["clean", "skipped"].includes(file.scanStatus) && (!file.embedded || used.has(file.id)));
  const keys = attachmentKeys(base, files);
  const written: Record<string, string> = {};
  for (const file of files) {
    const key = keys.get(file.id)!;
    try {
      if (previous?.files[file.id] !== key) await copyObject(fileKey(file.id), key);
      written[file.id] = key;
    } catch (error) {
      if ((error as { name?: string }).name !== "NoSuchKey") throw error;
      keys.delete(file.id);
    }
  }
  const siteUrl = doc.bodyMarkdown === null ? `${env.baseUrl}/d/${doc.id}` : null;
  await putObject(`${base}.md`, driveMarkdown({ ...place, description: doc.description, academicYear: doc.academicYear, body, siteUrl }, base, keys), "text/markdown; charset=utf-8");
  // Les nouvelles clés d'abord : une panne en plein milieu laisse un doublon temporaire, jamais un trou
  const next = { base, files: written };
  if (previous) {
    const kept = new Set(keysOf(next));
    for (const key of keysOf(previous)) if (!kept.has(key)) await deleteKey(key);
  }
  await db.insert(driveCopies).values({ documentId: doc.id, ...next, fingerprint })
    .onConflictDoUpdate({ target: driveCopies.documentId, set: { ...next, fingerprint, syncedAt: new Date() } });
}

/** Un tour de rattrapage, borné : un gros arriéré passe sur plusieurs tours sans retarder les mails. */
export async function syncDriveCopies() {
  const [goal, copies] = await Promise.all([wanted(), db.select().from(driveCopies)]);
  const goalIds = new Set(goal.map((d) => d.id));
  const byDoc = new Map(copies.map((c) => [c.documentId, c]));
  const taken = new Set(copies.filter((c) => goalIds.has(c.documentId)).map((c) => baseKey(c.base)));
  let budget = PER_ROUND;
  for (const copy of copies) {
    if (budget <= 0) return;
    if (goalIds.has(copy.documentId)) continue;
    budget--;
    await remove(copy).catch((error) => console.warn("copie Drive à retirer :", (error as Error).message));
  }
  for (const { id, fingerprint } of goal) {
    const previous = byDoc.get(id);
    if (previous?.fingerprint === fingerprint) continue;
    if (budget-- <= 0) return;
    if (previous) taken.delete(baseKey(previous.base));
    await write(id, fingerprint, previous, taken).catch((error) => {
      if (previous) taken.add(baseKey(previous.base));
      console.warn("copie Drive :", (error as Error).message);
    });
  }
}

/** Écriture interrompue, base restaurée : une clé inconnue de la table ne doit pas rester publiée sur le Drive. */
export async function sweepDriveOrphans() {
  const known = new Set((await db.select().from(driveCopies)).flatMap(keysOf));
  for (const key of await listKeys(DRIVE_PREFIX)) if (!known.has(key)) await deleteKey(key);
}
