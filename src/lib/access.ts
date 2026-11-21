import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import * as schema from "./db/schema";
import type { Document, User } from "./db/schema";

/** La seule définition de « qui peut lire quoi » : pages, recherche, fichiers et contenus l'utilisent toutes. */
export function canReadDocument(user: Pick<User, "id" | "role" | "programId">, doc: Pick<Document, "programId" | "published" | "createdBy" | "hiddenByReports" | "reviewRequested"> & { reviewNote?: string | null } & { deletedAt?: Date | null }) {
  if (user.role === "admin") return true;
  // À la corbeille : seul son auteur le voit encore (pour le restaurer)
  if (doc.deletedAt) return doc.createdBy === user.id;
  if (doc.programId !== user.programId) return false;
  // Le délégué modère ce qui est publié ou soumis en relecture ; un brouillon reste privé à ses auteurs
  if (user.role === "delegate" && inModeration(doc)) return true;
  if (doc.hiddenByReports) return doc.createdBy === user.id;
  return doc.published || doc.createdBy === user.id;
}

/** Un brouillon jamais soumis reste privé à ses auteurs ; publié, en relecture ou renvoyé avec un mot, il entre dans la modération. */
export function inModeration(doc: { published?: boolean; reviewRequested?: boolean; reviewNote?: string | null; hiddenByReports?: boolean }) {
  if (doc.published === undefined) return true; // matière, demande, personne : pas un document
  return doc.published || Boolean(doc.reviewRequested) || Boolean(doc.reviewNote) || Boolean(doc.hiddenByReports);
}

/** Valider, refuser, modérer : l'administrateur partout, le délégué dans sa licence et hors des brouillons privés. */
export function canModerate(user: Pick<User, "role" | "programId">, doc: Pick<Document, "programId"> & { published?: boolean; reviewRequested?: boolean; reviewNote?: string | null; hiddenByReports?: boolean }) {
  return user.role === "admin" || (user.role === "delegate" && doc.programId === user.programId && inModeration(doc));
}

/** Même règle en SQL, pour les listes. Un auteur retrouve ses brouillons dans « Mes cours », pas ici. */
export function readableDocuments(user: Pick<User, "role" | "programId">): SQL | undefined {
  // La corbeille n'apparaît dans aucune liste, même pour l'administration (elle a sa propre vue)
  if (user.role === "admin") return isNull(schema.documents.deletedAt);
  if (!user.programId) return sql`false`;
  return and(eq(schema.documents.programId, user.programId), eq(schema.documents.published, true), eq(schema.documents.hiddenByReports, false), isNull(schema.documents.deletedAt));
}

/** Un étudiant ne modifie que ses propres brouillons rédigés : jamais un contenu publié, ni du HTML. */
export function canEditCourse(user: Pick<User, "id" | "role" | "programId">, doc: Pick<Document, "kind" | "programId" | "published" | "createdBy" | "reviewRequested"> & { reviewNote?: string | null } & { deletedAt?: Date | null }) {
  if (doc.kind !== "editor") return false;
  if (doc.deletedAt) return false;
  if (user.role === "admin") return true;
  if (user.role === "delegate" && doc.programId === user.programId && inModeration(doc)) return true;
  return doc.createdBy === user.id && !doc.published && doc.programId === user.programId;
}
