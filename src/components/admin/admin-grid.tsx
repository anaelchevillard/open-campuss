"use client";

import { useTable, type RowSelectionState, type SortingState } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridTable, DataGridTableRowSelect, DataGridTableRowSelectAll } from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia } from "@/components/ui/item";
import { IconBack, IconChevronRight } from "@/lib/icons";

export type GridColumn<T> = { id: string; header: string; cell: (row: T) => ReactNode; sortable?: boolean; numeric?: boolean; size?: number; hideBelow?: "lg" | "xl" };

const FR = {
  labels: {
    sortAscending: "Croissant", sortDescending: "Décroissant", selectRow: "Sélectionner la ligne", selectAll: "Tout sélectionner", columnsMenu: "Colonnes", toggleColumns: "Colonnes",
    loading: "Chargement…", empty: "Rien ici", pinColumnStart: "Épingler à gauche", pinColumnEnd: "Épingler à droite", moveColumnStart: "Vers la gauche", moveColumnEnd: "Vers la droite",
  },
};

/** Paramètres d'URL de la grille : l'état (tri, page, recherche, filtres) vit dans l'adresse, pour les liens profonds. */
export function useGridParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = useCallback((patch: Record<string, string | null>, resetPage = true, push = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    const query = next.toString();
    (push ? router.push : router.replace)(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  return { params, set };
}

/**
 * Grille de l'administration : DataGrid ReUI (tri serveur, sélection, pagination serveur) à partir de 768 px,
 * liste Item au téléphone (jamais un tableau transformé en cartes). Raccourcis : / chercher, j/k, x, Entrée, e, Échap.
 */
export function AdminGrid<T extends { id: string }>({
  rows, columns, total, page, pageSize, selectable = true, selected, onSelectedChange, href, onOpen, mobileItem, empty, highlight, label,
}: {
  rows: T[]; columns: GridColumn<T>[]; total: number; page: number; pageSize: number;
  selectable?: boolean; selected: string[]; onSelectedChange: (ids: string[]) => void;
  href?: (row: T) => string; onOpen?: (row: T) => void;
  mobileItem: (row: T) => { title: ReactNode; meta?: ReactNode; media?: ReactNode; badge?: ReactNode };
  empty?: ReactNode; highlight?: string | null; label: string;
}) {
  const { params, set } = useGridParams();
  const sorting: SortingState = useMemo(() => {
    const id = params.get("tri");
    return id ? [{ id, desc: params.get("sens") !== "asc" }] : [];
  }, [params]);
  const rowSelection: RowSelectionState = useMemo(() => Object.fromEntries(selected.map((id) => [id, true])), [selected]);
  const [cursor, setCursor] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);

  const helper = createColumnHelper<DataGridFeatures, T>();
  const defs = useMemo(() => [
    ...(selectable ? [helper.display({
      id: "select", size: 44, enableSorting: false,
      header: () => <DataGridTableRowSelectAll />,
      cell: ({ row }) => <DataGridTableRowSelect row={row} />,
      meta: { headerClassName: "w-11", cellClassName: "w-11" },
    })] : []),
    ...columns.map((c) => helper.display({
      id: c.id, size: c.size, enableSorting: Boolean(c.sortable),
      header: ({ column }) => c.sortable ? <DataGridColumnHeader column={column} title={c.header} /> : <span className="text-sm">{c.header}</span>,
      cell: ({ row }) => c.cell(row.original),
      meta: { headerTitle: c.header, headerClassName: cn(c.numeric && "text-right", c.hideBelow === "lg" && "max-lg:hidden", c.hideBelow === "xl" && "max-xl:hidden"), cellClassName: cn(c.numeric && "text-right tabular-nums", c.hideBelow === "lg" && "max-lg:hidden", c.hideBelow === "xl" && "max-xl:hidden") },
    })),
  ], [columns, selectable, helper]);

  const table = useTable({
    features: dataGridFeatures, columns: defs, data: rows, getRowId: (row) => row.id,
    manualSorting: true, manualPagination: true, enableRowSelection: selectable,
    state: { sorting, rowSelection, pagination: { pageIndex: 0, pageSize: Math.max(rows.length, 1) } },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      set({ tri: next[0]?.id ?? null, sens: next[0] ? (next[0].desc ? null : "asc") : null });
    },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      onSelectedChange(Object.keys(next).filter((k) => next[k]));
    },
  });

  // Raccourcis de grille (inactifs dans un champ, coupés par la préférence shortcuts: false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.documentElement.classList.contains("no-shortcuts") || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        setCursor((c) => Math.max(0, Math.min(rows.length - 1, c + (event.key === "j" ? 1 : -1))));
      } else if (event.key === "x" && rows[cursor]) {
        const id = rows[cursor].id;
        onSelectedChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
      } else if ((event.key === "Enter" || event.key === "e") && rows[cursor]) {
        if (onOpen) onOpen(rows[cursor]);
        else if (href) window.location.assign(href(rows[cursor]));
      } else if (event.key === "Escape" && selected.length) onSelectedChange([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, selected, onSelectedChange, onOpen, href]);

  useEffect(() => {
    wrapper.current?.querySelectorAll("tbody tr").forEach((tr, i) => tr.toggleAttribute("data-cursor", i === cursor));
  }, [cursor, rows]);

  useEffect(() => {
    if (!highlight) return;
    const tr = wrapper.current?.querySelector(`[data-row-id="${CSS.escape(highlight)}"]`);
    tr?.classList.add("admin-row-flash");
  }, [highlight, rows]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const toggle = (id: string, on: boolean) => onSelectedChange(on ? [...selected, id] : selected.filter((s) => s !== id));

  return (
    <div ref={wrapper} aria-label={label}>
      {rows.length === 0 && empty ? empty : (
        <>
          <div className="hidden md:block">
            <DataGrid table={table} recordCount={total} i18n={FR} onRowClick={onOpen} tableLayout={{ dense: true, rowBorder: true, headerBackground: true, headerSticky: false, width: "auto" }}
              tableClassNames={{ bodyRow: "data-cursor:bg-brand-tint/60 cursor-default", base: "text-sm" }}>
              <DataGridContainer className="rounded-xl bg-card shadow-xs">
                <DataGridTable />
              </DataGridContainer>
            </DataGrid>
          </div>
          <ItemGroup className="gap-0 overflow-hidden rounded-xl bg-card shadow-xs md:hidden">
            {rows.map((row) => {
              const item = mobileItem(row);
              const content = (
                <>
                  {item.media && <ItemMedia>{item.media}</ItemMedia>}
                  <ItemContent className="min-w-0">
                    <span className="font-semibold wrap-break-word">{item.title}</span>
                    {item.meta && <span className="text-sm text-muted-foreground">{item.meta}</span>}
                  </ItemContent>
                  <ItemActions>{item.badge}<Icon icon={IconChevronRight} size={16} className="text-muted-foreground" /></ItemActions>
                </>
              );
              return (
                <div key={row.id} data-row-id={row.id} className="flex items-center border-b border-border last:border-0">
                  {selectable && <label className="flex min-h-11 min-w-11 items-center justify-center"><Checkbox checked={selected.includes(row.id)} onCheckedChange={(v) => toggle(row.id, Boolean(v))} aria-label="Sélectionner" /></label>}
                  {href ? <Item render={<Link href={href(row)} />} className="min-h-11 flex-1 rounded-none px-2">{content}</Item>
                    : <Item render={<button type="button" onClick={() => onOpen?.(row)} />} className="min-h-11 flex-1 rounded-none px-2 text-left">{content}</Item>}
                </div>
              );
            })}
          </ItemGroup>
        </>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="tabular-nums">{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} sur {total}</span>
          <span className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, false)} aria-label="Page précédente"><Icon icon={IconBack} size={16} /></Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => set({ page: String(page + 1) }, false)} aria-label="Page suivante"><Icon icon={IconChevronRight} size={16} /></Button>
          </span>
        </nav>
      )}
    </div>
  );
}
