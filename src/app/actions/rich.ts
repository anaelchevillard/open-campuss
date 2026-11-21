"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { artifactRef } from "@/lib/rich/artifact";
import { artifactSrc } from "@/lib/rich/artifact-server";

/** L'adresse signée d'un artefact pour l'aperçu dans l'éditeur : seulement pour qui peut lire le cours. */
export async function artifactPreviewUrl(docId: string, src: string, entry: string): Promise<{ url: string } | { error: string }> {
  const user = await requireUser();
  const id = z.uuid().safeParse(docId);
  const ref = artifactRef({ src, entry });
  if (!id.success || !ref) return { error: "Artefact introuvable." };
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id.data));
  if (!doc || !(await canRead(user, doc))) return { error: "Artefact introuvable." };
  return { url: artifactSrc(doc.id, user.id)(ref.fileId, ref.entry) };
}
