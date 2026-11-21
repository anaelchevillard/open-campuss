import "server-only";
import { and, eq } from "drizzle-orm";
import type { Readable } from "node:stream";
import { extractText, getDocumentProxy } from "unpdf";
import { antivirusEnabled, scanStream } from "./clamav";
import { refreshSearchText } from "./content";
import { db, schema } from "./db";
import { notifyAdmins, queueMail } from "./mail";
import { adminMails, contentMails } from "@/lib/mail/catalog";
import { deleteKey, fileKey, getObject } from "./s3";

const { docFiles, documents, subjects, users, auditLog } = schema;
const MAX_TEXT_PDF = 60 * 1024 * 1024;

export async function rebuildDocumentSearch(documentId: string) {
  const [row] = await db.select({ doc: documents, subject: subjects.name }).from(documents).leftJoin(subjects, eq(documents.subjectId, subjects.id)).where(eq(documents.id, documentId));
  if (!row) return;
  const files = await db.select({ filename: docFiles.filename, text: docFiles.extractedText }).from(docFiles).where(eq(docFiles.documentId, documentId));
  const body = `${row.doc.bodyText} ${files.map((f) => f.text ?? "").join(" ")}`;
  await db.update(documents).set({ searchText: refreshSearchText({ title: row.doc.title, subject: row.subject, description: row.doc.description, academicYear: row.doc.academicYear, teacher: row.doc.teacherName, files: files.map((f) => f.filename), body }) }).where(eq(documents.id, documentId));
}

/** Analyse antivirus puis indexation du texte des PDF, un fichier après l'autre pour ménager la mémoire. */
export async function runFileJobs() {
  if (antivirusEnabled()) {
    const pending = await db.select({ file: docFiles, doc: documents }).from(docFiles).innerJoin(documents, eq(docFiles.documentId, documents.id)).where(eq(docFiles.scanStatus, "pending")).limit(3);
    for (const { file, doc } of pending) {
      try {
        const object = await getObject(fileKey(file.id));
        if (!object?.Body) continue;
        const virus = await scanStream(object.Body as Readable);
        if (!virus) {
          await db.update(docFiles).set({ scanStatus: "clean" }).where(eq(docFiles.id, file.id));
          continue;
        }
        await deleteKey(fileKey(file.id));
        await db.delete(docFiles).where(eq(docFiles.id, file.id));
        await db.insert(auditLog).values({ actor: "antivirus", action: "fichier_infecté", target: `${file.filename} : ${virus}`.slice(0, 300) });
        await notifyAdmins(adminMails.infectedFile(file.filename, doc.title, virus), { batch: false });
        if (doc.createdBy) {
          const [author] = await db.select().from(users).where(eq(users.id, doc.createdBy));
          if (author) await queueMail(author.email, contentMails.fileRejected(file.filename), { batch: true });
        }
      } catch (error) {
        // Le fichier reste en attente et inaccessible : on préfère un retard à un fichier non analysé
        console.warn("antivirus indisponible :", (error as Error).message);
        break;
      }
    }
  }
  const toIndex = await db.select().from(docFiles).where(and(eq(docFiles.textChecked, false), eq(docFiles.inlineType, "application/pdf"), eq(docFiles.embedded, false))).limit(2);
  for (const file of toIndex) {
    let text = "";
    try {
      if (file.size <= MAX_TEXT_PDF && file.scanStatus !== "pending") {
        const object = await getObject(fileKey(file.id));
        if (object?.Body) {
          const pdf = await getDocumentProxy(new Uint8Array(await object.Body.transformToByteArray()));
          text = String((await extractText(pdf, { mergePages: true })).text).slice(0, 200_000);
        }
      } else if (file.scanStatus === "pending") continue;
    } catch (error) {
      console.warn("texte du PDF illisible :", (error as Error).message);
    }
    await db.update(docFiles).set({ extractedText: text, textChecked: true }).where(eq(docFiles.id, file.id));
    await rebuildDocumentSearch(file.documentId);
  }
}
