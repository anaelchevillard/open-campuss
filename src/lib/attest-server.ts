import "server-only";
import { and, eq } from "drizzle-orm";
import { clientIp } from "./auth";
import { ATTESTATIONS, attestationVersion, type AttestationKind, type RememberedKind } from "./attestations";
import { db, schema } from "./db";
import { TERMS_VERSION } from "./db/categories";
import type { User } from "./db/schema";

/** La preuve : qui, quand, depuis où, pour quel document, et le texte exact accepté. */
export async function recordAttestation(user: Pick<User, "id" | "email" | "name">, kind: AttestationKind, doc?: { id: string; title: string } | null) {
  await db.insert(schema.attestations).values({
    userId: user.id, userEmail: user.email, userName: user.name, kind, text: ATTESTATIONS[kind], documentId: doc?.id ?? null, documentTitle: doc?.title ?? "",
    termsVersion: TERMS_VERSION, ip: await clientIp(),
  });
}

/** Les types de contenu pour lesquels cette personne a déjà accepté le texte actuel. Chaque document garde sa propre preuve ci-dessus. */
export async function acceptedCategories(userId: string, kind: RememberedKind) {
  const rows = await db.select({ category: schema.attestationAcceptances.category }).from(schema.attestationAcceptances)
    .where(and(eq(schema.attestationAcceptances.userId, userId), eq(schema.attestationAcceptances.kind, kind), eq(schema.attestationAcceptances.version, attestationVersion(kind))));
  return rows.map((row) => row.category);
}

export async function rememberAcceptance(userId: string, kind: RememberedKind, category = "") {
  await db.insert(schema.attestationAcceptances).values({ userId, kind, category, version: attestationVersion(kind) }).onConflictDoNothing();
}
