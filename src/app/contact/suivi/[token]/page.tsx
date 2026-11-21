import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalShell } from "@/components/legal-shell";
import { db, schema } from "@/lib/db";
import { formatDateTime } from "@/lib/documents";

export const metadata: Metadata = { title: "Suivi de la demande", referrer: "no-referrer" };

const STATUS = { open: "En cours de traitement", accepted: "Traitée : demande acceptée", dismissed: "Traitée : demande non retenue" };

/** Le jeton du lien remplace un compte : un enseignant suit sa demande sans s'inscrire. */
export default async function ReportTrackingPage({ params }: PageProps<"/contact/suivi/[token]">) {
  const { token } = await params;
  if (!/^[\w-]{20,64}$/.test(token)) notFound();
  const [row] = await db.select({ report: schema.reports, doc: schema.documents }).from(schema.reports).leftJoin(schema.documents, eq(schema.reports.documentId, schema.documents.id)).where(eq(schema.reports.trackingToken, token));
  if (!row) notFound();
  const { report, doc } = row;
  return (
    <LegalShell title="Suivi de la demande">
      <p className="text-lg font-semibold">{STATUS[report.status]}</p>
      <p>Reçue le {formatDateTime(report.createdAt)}{report.closedAt ? `, traitée le ${formatDateTime(report.closedAt)}` : ""}.</p>
      {doc && <p>Document concerné : {doc.title}. {doc.published && !doc.hiddenByReports ? "Il est actuellement en ligne." : "Il n’est plus accessible aux étudiants."}</p>}
      <h2>Message</h2>
      <p className="whitespace-pre-line">{report.message}</p>
      {report.response && <><h2>Réponse</h2><p className="whitespace-pre-line">{report.response}</p></>}
    </LegalShell>
  );
}
