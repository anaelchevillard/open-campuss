import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FILE_TABS, PersonFile, type FileTab } from "@/components/admin/person-file";
import { PageTitle } from "@/components/page-title";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/icon";
import { requireAdmin } from "@/lib/auth";
import { IconBack } from "@/lib/icons";

export const metadata: Metadata = { title: "Fiche" };

/** Fiche en page pleine (téléphone, lien direct, palette) ; à l'ordinateur elle s'ouvre aussi en panneau depuis la grille. */
export default async function PersonPage({ params, searchParams }: PageProps<"/admin/personnes/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const raw = (await searchParams).vue;
  const vue = (FILE_TABS.some(([t]) => t === raw) ? raw : "apercu") as FileTab;
  return (
    <Shell user={admin} width="wide">
      <PageTitle title="Fiche" />
      <Link href="/admin/personnes" className="mb-4 hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:inline-flex"><Icon icon={IconBack} size={16} />Personnes</Link>
      <h1 className="sr-only">Fiche</h1>
      <PersonFile id={id} tab={vue} admin={admin} base={(tab) => (tab === "apercu" ? `/admin/personnes/${id}` : `/admin/personnes/${id}?vue=${tab}`)} />
    </Shell>
  );
}
