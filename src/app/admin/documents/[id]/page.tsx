import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { deleteDocument, deleteFile, requestSync } from "@/app/actions/admin/content";
import { ConfirmForm } from "@/components/action-form";
import { DocumentAuthors } from "@/components/admin/document-authors";
import { DocumentForm } from "@/components/document-form";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { subjectOptions } from "@/lib/catalog";
import { KINDS } from "@/lib/db/schema";
import { authorsOf } from "@/lib/document-authors";
import { formatDateTime, formatSize, visibleDocument } from "@/lib/documents";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Modifier le document" };

export default async function EditDocumentPage({ params }: PageProps<"/admin/documents/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { doc, files } = await visibleDocument(id, admin);
  const subjects = await subjectOptions(admin);
  return (
    <Shell user={admin} width="wide">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display-2 wrap-break-word">{doc.title}</h1>
        <Link href={`/d/${doc.id}`} data-slot="button" className={buttonVariants({ variant: "outline" })}>Voir</Link>
      </div>
      <DocumentForm
        notionReady={Boolean(env.notionToken)}
        subjects={subjects}
        initial={{
          id: doc.id, title: doc.title, category: doc.category, subject: doc.subjectId ? String(doc.subjectId) : "", academicYear: doc.academicYear, teacherName: doc.teacherName,
          chapter: doc.chapter ? String(doc.chapter) : "", description: doc.description, externalUrl: doc.externalUrl ?? "",
          published: doc.published, syncError: doc.syncError, kind: doc.kind, rights: doc.rightsBasis,
          kindLabel: `${KINDS[doc.kind] ?? doc.kind}${doc.syncedAt ? `, synchronisé le ${formatDateTime(doc.syncedAt)}` : ""}`,
        }}
      />
      <div className="mt-10 grid max-w-3xl gap-8">
        <DocumentAuthors documentId={doc.id} authors={(await authorsOf(doc.id)).map((a) => ({ id: a.id, name: a.name, role: a.role }))} />
        {doc.kind === "notion" && (
          <ConfirmForm action={requestSync}><input type="hidden" name="id" value={doc.id} /><Submit variant="outline" >Synchroniser avec Notion maintenant</Submit></ConfirmForm>
        )}
        {files.length > 0 && (
          <section>
            <h2 className="mb-1 text-lg font-semibold">Fichiers joints</h2>
            <ul className="line-list">
              {files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="font-semibold wrap-break-word">{f.filename}</span>
                  <span className="text-sm text-muted-foreground">{formatSize(f.size)}</span>
                  <ConfirmForm className="ml-auto" action={deleteFile} confirm="Ce fichier sera supprimé."><input type="hidden" name="id" value={f.id} /><Submit size="sm" variant="destructive">Supprimer</Submit></ConfirmForm>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="border-t border-border pt-6">
          <h2 className="mb-1 text-lg font-semibold">Supprimer ce document</h2>
          <p className="mb-3 text-[0.95rem] text-muted-foreground">Le document part à la corbeille : il disparaît partout et sera effacé dans 30 jours.</p>
          <ConfirmForm action={deleteDocument} confirm="Le document part à la corbeille."><input type="hidden" name="id" value={doc.id} /><Submit variant="destructive" >Supprimer le document</Submit></ConfirmForm>
        </section>
      </div>
    </Shell>
  );
}
