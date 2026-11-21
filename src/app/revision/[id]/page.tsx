import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { revisionAccess } from "@/lib/revision";

/** Les anciens liens : la révision se passe désormais sur la page du cours. */
export default async function RevisionPage({ params }: PageProps<"/revision/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const access = await revisionAccess(id, user.id);
  if (!access) notFound();
  redirect(`/d/${access.space.documentId}${access.owner ? "" : `?revision=${id}`}`);
}
