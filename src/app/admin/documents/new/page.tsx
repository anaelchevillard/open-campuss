import type { Metadata } from "next";
import { DocumentForm } from "@/components/document-form";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { subjectOptions } from "@/lib/catalog";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Nouveau document" };

export default async function NewDocumentPage({ searchParams }: PageProps<"/admin/documents/new">) {
  const admin = await requireAdmin();
  const subjects = await subjectOptions(admin);
  const matiere = (await searchParams).matiere;
  return (
    <Shell user={admin} width="wide">
      <h1 className="display-2">Nouveau document</h1>
      <DocumentForm subjects={subjects} presetSubject={typeof matiere === "string" ? matiere : undefined} notionReady={Boolean(env.notionToken)} />
    </Shell>
  );
}
