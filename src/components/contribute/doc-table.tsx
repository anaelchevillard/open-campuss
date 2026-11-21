"use client";

import Link from "next/link";
import { useMemo } from "react";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { DataGrid, DataGridContainer, dataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import type { MenuEntry } from "@/components/responsive-menu";
import { StatusBadge } from "@/components/status-badge";
import { CATEGORY_TAGS } from "@/lib/db/categories";
import { formatRating, type MyDoc } from "@/lib/my-documents";
import { DocMenu, hrefOf, WithContextMenu } from "./doc-menu";

const helper = createColumnHelper<typeof dataGridFeatures, MyDoc>();
const right = { headerClassName: "text-right [&>*]:justify-end", cellClassName: "text-right tabular-nums" };

const modified = (iso: string) => {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return "aujourd’hui";
  if (days < 2) return "hier";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(days > 300 ? { year: "numeric" } : {}), timeZone: "Europe/Paris" });
};

/** Vue liste de Mes documents (ordinateur et tablette) : dense, chiffres alignés à droite, « … » en bout de ligne. Le tri vient de l'adresse. */
export function DocTable({ docs, entries }: { docs: MyDoc[]; entries: (doc: MyDoc) => MenuEntry[] }) {
  const columns = useMemo(() => helper.columns([
    helper.accessor("title", {
      header: "Titre et matière", size: 380, meta: { fillWidth: true },
      cell: ({ row }) => (
        <span className="grid min-w-0 py-1">
          <Link href={hrefOf(row.original)} className="truncate font-semibold hover:underline">{row.original.title.trim() || "Sans titre"}</Link>
          <span className="truncate text-sm text-muted-foreground">{[CATEGORY_TAGS[row.original.category], row.original.subject].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    }),
    helper.accessor("status", { header: "Statut", size: 200, cell: ({ row }) => <StatusBadge status={row.original.status} size="default" /> }),
    helper.accessor("readersWeek", { header: "Lecteurs 7 j", size: 110, meta: right, cell: ({ row }) => (row.original.published ? row.original.readersWeek.toLocaleString("fr-FR") : "–") }),
    helper.accessor("ratingAvg", { header: "Note", size: 80, meta: right, cell: ({ row }) => (row.original.ratingAvg === null ? "–" : formatRating(row.original.ratingAvg)) }),
    helper.accessor("updatedAt", { header: "Modifié", size: 120, meta: right, cell: ({ row }) => modified(row.original.updatedAt) }),
    helper.display({
      id: "actions", header: () => <span className="sr-only">Actions</span>, size: 56, meta: { cellClassName: "text-right" },
      cell: ({ row }) => <WithContextMenu>{(ref) => <DocMenu doc={row.original} entries={entries(row.original)} menuRef={ref} />}</WithContextMenu>,
    }),
  ]), [entries]);
  const table = useTable({
    features: dataGridFeatures, columns, data: docs, getRowId: (row) => row.id,
    initialState: { pagination: { pageIndex: 0, pageSize: 500 } },
  });
  return (
    <DataGrid table={table} recordCount={docs.length}
      tableLayout={{ dense: true, headerSticky: false, rowBorder: true, width: "fixed" }} emptyMessage="Aucun document">
      <DataGridContainer className="rounded-xl bg-card shadow-xs"><DataGridTable /></DataGridContainer>
    </DataGrid>
  );
}
