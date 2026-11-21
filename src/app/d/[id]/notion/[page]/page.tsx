import Link from "next/link";
import { notFound } from "next/navigation";
import { NotionView } from "@/components/notion-view";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { visibleDocument } from "@/lib/documents";
import { loadDatabases, loadSnapshot } from "@/lib/notion";
import { NotionDatabases } from "@/components/notion-databases";

export default async function NotionSubPage({ params }: PageProps<"/d/[id]/notion/[page]">) {
  const user = await requireUser();
  const { id, page } = await params;
  const { doc } = await visibleDocument(id, user);
  // Identifiant strict : il compose une clé de stockage, et seules les pages importées de ce document existent
  if (!/^[0-9a-f]{32}$/.test(page) || !doc.contentVersion) notFound();
  const recordMap = await loadSnapshot(doc.id, doc.contentVersion, page);
  if (!recordMap) notFound();
  return (
    <Shell user={user} width="reading">
      <p className="mb-3 text-sm"><Link className="text-muted-foreground hover:text-foreground" href={`/d/${doc.id}`}>Retour à {doc.title}</Link></p>
      <NotionView recordMap={recordMap} docId={doc.id} rootPage={doc.notionPageId ?? page} />
      <NotionDatabases docId={doc.id} databases={await loadDatabases(doc.id, doc.contentVersion, page)} />
    </Shell>
  );
}
