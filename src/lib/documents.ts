import "server-only";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { canRead } from "./access-server";
import { db, schema } from "./db";
import type { User } from "./db/schema";

/** Tout accès à un document passe ici : un brouillon ou une autre licence renvoient 404, même avec l'URL. */
export async function visibleDocument(rawId: string, user: User) {
  if (!z.uuid().safeParse(rawId).success) notFound();
  const [row] = await db.select({ doc: schema.documents, subject: schema.subjects, program: schema.programs }).from(schema.documents)
    .innerJoin(schema.programs, eq(schema.documents.programId, schema.programs.id))
    .leftJoin(schema.subjects, eq(schema.documents.subjectId, schema.subjects.id)).where(eq(schema.documents.id, rawId));
  if (!row || !(await canRead(user, row.doc))) notFound();
  const all = await db.select().from(schema.docFiles).where(eq(schema.docFiles.documentId, rawId)).orderBy(asc(schema.docFiles.filename));
  return { ...row, files: all.filter((f) => !f.embedded) };
}

export function formatSize(value: number) {
  let size = value;
  for (const unit of ["o", "Ko", "Mo"]) {
    if (size < 1024) return `${unit === "o" ? size : size.toFixed(1).replace(".", ",")} ${unit}`;
    size /= 1024;
  }
  return `${size.toFixed(1).replace(".", ",")} Go`;
}

export const formatDate = (date: Date | null) => (date ? date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "—");
export const formatDateTime = (date: Date | null) => (date ? date.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : "—");

export function academicYearNow(now = new Date()) {
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}
