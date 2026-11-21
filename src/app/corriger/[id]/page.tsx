import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocEditor } from "@/components/doc-editor";
import { Shell } from "@/components/shell";
import { acceptedCategories } from "@/lib/attest-server";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { markdownToBlocks } from "@/lib/blocks";
import { subjectOptions } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { authorsOf } from "@/lib/document-authors";

export const metadata: Metadata = { title: "Proposer une modification" };

export default async function ProposeRevisionPage({ params }: PageProps<"/corriger/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  // Tout lecteur propose une modification d'un cours publié ; la relecture décide
  if (!doc?.published || doc.kind !== "editor" || doc.deletedAt || doc.hiddenByReports || !(await canRead(user, doc))) notFound();
  const [program] = await db.select({ name: schema.programs.name }).from(schema.programs).where(eq(schema.programs.id, doc.programId));
  const authors = await authorsOf(id);
  const author = authors.find((a) => a.role === "auteur");
  const coauthors = authors.filter((a) => a.role !== "auteur").map(({ id: coauthorId, name, avatarKey }) => ({ id: coauthorId, name, avatarKey }));
  return (
    <Shell user={user} width="reading">
      <DocEditor
        docId={id} initial={doc.bodyBlocks ?? markdownToBlocks(doc.bodyMarkdown ?? "")} mode="proposal" program={program?.name ?? ""} year={doc.academicYear}
        fields={{ title: doc.title, subject: doc.subjectId, category: doc.category, chapter: doc.chapter ? String(doc.chapter) : "", semester: doc.semester ? String(doc.semester) : "", rights: doc.rightsBasis, teacher: doc.teacherName }}
        published reviewRequested={false} reviewNote={null} coverFileId={doc.coverFileId} author={author ? { id: author.id, name: author.name, avatarKey: author.avatarKey } : { id: user.id, name: user.name, avatarKey: user.avatarKey }} coauthors={coauthors} friends={[]} subjects={await subjectOptions(user)} files={[]}
        canPublish={false} canOcr={false} notionReady={false} startImport={false} startShare={false} aiReady={false} pagesLeft={null} ocrAccepted={false} acceptedCategories={await acceptedCategories(user.id, "share")}
      />
    </Shell>
  );
}
