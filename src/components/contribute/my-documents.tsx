"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { DocCard, DocGrid } from "@/components/doc-card";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { StatusBadge, type DocStatus } from "@/components/status-badge";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { CATEGORY_TAGS } from "@/lib/db/categories";
import { IconClose, IconDelete, IconFavorite, IconFilter, IconGrid, IconList, IconPeople, IconRequests, IconSearch, IconSort, IconExpand } from "@/lib/icons";
import { draftMissing, filterMyDocs, formatRating, MY_SORTS, MY_TABS, myQueryString, parseMyQuery, sortMyDocs, tabCounts, type MyDoc, type MyQuery, type MyView } from "@/lib/my-documents";
import { DocMenu, hrefOf, useDocActions, WithContextMenu } from "./doc-menu";
import { DocSheet } from "./doc-sheet";
import { DocTable } from "./doc-table";

const VIEW_KEY = "campuss-mes-documents-vue";
const TRASH_DAYS = 30;

export type Option = { value: string; label: string };

// La vue gardée sur l'appareil ; l'adresse l'emporte quand elle en donne une
const subscribeView = (onChange: () => void) => { window.addEventListener("storage", onChange); return () => window.removeEventListener("storage", onChange); };
function readView(): MyView | null {
  try { const v = localStorage.getItem(VIEW_KEY); return v === "liste" || v === "grille" ? v : null; } catch { return null; }
}

/**
 * Mes documents : onglets par statut, recherche, filtres, tri et vue. Tout l'état vit dans l'adresse (remplacée, pas
 * empilée) : le retour arrière depuis un cours retrouve la même liste. La vue choisie est aussi gardée sur l'appareil.
 */
export function MyDocuments({ docs: initial, subjects, years, viewerId, withdrawDirectly }: { docs: MyDoc[]; subjects: Option[]; years: Option[]; viewerId: string; withdrawDirectly: boolean }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const query = useMemo(() => parseMyQuery((k) => params.get(k)), [params]);
  const sheetId = params.get("doc");
  const [docs, setDocs] = useState(initial);
  // Nouvelles données du serveur (après une action) : elles remplacent l'état optimiste
  const [source, setSource] = useState(initial);
  if (source !== initial) { setSource(initial); setDocs(initial); }
  const storedView = useSyncExternalStore(subscribeView, readView, () => null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const write = useCallback((next: MyQuery, doc: string | null = sheetId) => {
    const qs = new URLSearchParams(myQueryString(next).slice(1));
    if (doc) qs.set("doc", doc);
    const s = qs.toString();
    window.history.replaceState(null, "", `${pathname}${s ? `?${s}` : ""}`);
  }, [pathname, sheetId]);
  const update = (patch: Partial<MyQuery>) => write({ ...query, ...patch });
  const view: MyView = query.view ?? storedView ?? "grille";
  const setView = (v: MyView) => {
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage indisponible */ }
    update({ view: v });
  };

  const patch = useCallback((id: string, status: DocStatus | null) => {
    if (status) setDocs((all) => all.map((d) => (d.id === id ? { ...d, status, published: status === "draft" ? false : d.published } : d)));
  }, []);
  const openSheet = (id: string | null) => write(query, id);
  const { entries, confirm } = useDocActions({ patch, openSheet: (id) => openSheet(id), withdrawDirectly });

  const counts = useMemo(() => tabCounts(docs), [docs]);
  const shown = useMemo(() => sortMyDocs(filterMyDocs(docs, query), query.sort), [docs, query]);
  const sheetDoc = docs.find((d) => d.id === sheetId) ?? null;
  const filtersActive = [query.subject, query.type, query.year].filter(Boolean).length;
  const types = (Object.keys(CATEGORY_TAGS) as (keyof typeof CATEGORY_TAGS)[]).filter((c) => docs.some((d) => d.category === c)).map((c) => ({ value: c, label: CATEGORY_TAGS[c] }));
  const usedSubjects = subjects.filter((s) => docs.some((d) => String(d.subjectId) === s.value));

  return (
    <div className="grid gap-4">
      <SegmentedTabs label="Statut" value={query.tab} onValueChange={(v) => update({ tab: v as MyQuery["tab"] })}
        items={MY_TABS.filter((t) => t.value !== "corbeille" || counts.corbeille > 0 || query.tab === "corbeille").map((t) => ({ value: t.value, label: t.label, count: t.value === "tous" ? undefined : counts[t.value] }))} />

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full md:w-64">
          <InputGroupAddon><Icon icon={IconSearch} size={16} /></InputGroupAddon>
          <InputGroupInput type="search" aria-label="Rechercher dans mes documents" placeholder="Rechercher" value={query.q} onChange={(e) => update({ q: e.target.value })} />
        </InputGroup>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <FilterChip label="Matière" value={query.subject} options={usedSubjects} onChange={(v) => update({ subject: v })} />
          <FilterChip label="Type" value={query.type} options={types} onChange={(v) => update({ type: v })} />
          {years.length > 1 && <FilterChip label="Année" value={query.year} options={years} onChange={(v) => update({ year: v })} />}
        </div>
        <Button variant="outline" className="md:hidden" onClick={() => setFiltersOpen(true)}>
          <Icon icon={IconFilter} size={16} />Filtres{filtersActive > 0 && <Badge variant="primary-light" size="sm" radius="full" className="tabular-nums">{filtersActive}</Badge>}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <SortMenu value={query.sort} onChange={(sort) => update({ sort })} />
          <ToggleGroup variant="outline" size="sm" spacing={0} className="hidden md:flex" value={[view]} onValueChange={(v: string[]) => { if (v[0]) setView(v[0] as MyView); }} aria-label="Vue">
            <ToggleGroupItem value="grille" aria-label="Grille"><Icon icon={IconGrid} size={16} /></ToggleGroupItem>
            <ToggleGroupItem value="liste" aria-label="Liste"><Icon icon={IconList} size={16} /></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {query.tab === "corbeille" && shown.length > 0 && <p className="text-sm text-muted-foreground">Supprimés pour de bon après {TRASH_DAYS} jours</p>}

      <div key={`${query.tab}-${query.sort}-${view}`} className="motion-ok:animate-[vt-fade-in_var(--dur-fast)_var(--ease-out)_both]">
        {shown.length === 0 ? (
          <EmptyState icon={query.tab === "corbeille" ? IconDelete : IconSearch} title={query.tab === "corbeille" ? "Corbeille vide" : "Aucun document ici"}
            action={(query.q || filtersActive > 0) ? <Button variant="link" onClick={() => update({ q: "", subject: "", type: "", year: "" })}>Retirer les filtres</Button> : undefined} />
        ) : (
          <>
            {/* Téléphone : la liste seule */}
            <ul className="stagger grid gap-1 md:hidden">
              {shown.map((doc) => (
                <li key={doc.id}>
                  <WithContextMenu>{(ref) => (
                    <Item size="sm" className="min-h-14 rounded-xl bg-card shadow-xs">
                      <ItemContent className="min-w-0">
                        <ItemTitle className="line-clamp-2 w-full font-semibold"><Link href={hrefOf(doc)} className="after:absolute after:inset-0">{doc.title.trim() || "Sans titre"}</Link></ItemTitle>
                        <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1"><StatusBadge status={doc.status} size="sm" />{doc.subject && <span className="truncate">{doc.subject}</span>}</ItemDescription>
                      </ItemContent>
                      <ItemActions className="relative z-10"><DocMenu doc={doc} entries={entries(doc)} menuRef={ref} /></ItemActions>
                    </Item>
                  )}</WithContextMenu>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              {view === "liste"
                ? <DocTable docs={shown} entries={entries} />
                : (
                  <DocGrid>
                    {shown.map((doc) => (
                      <li key={doc.id}>
                        <WithContextMenu className="h-full">{(ref) => (
                          <DocCard doc={{ ...doc, subjectShort: doc.subject, updatedAt: undefined, ratingAvg: null, ratingCount: 0, readers: 0 }} href={hrefOf(doc)} status={doc.status} meta={doc.subject ?? undefined}
                            footer={<CardFooter doc={doc} menu={<DocMenu doc={doc} entries={entries(doc)} menuRef={ref} className="-my-1 -mr-2" />} onStats={() => openSheet(doc.id)} />} />
                        )}</WithContextMenu>
                      </li>
                    ))}
                  </DocGrid>
                )}
            </div>
          </>
        )}
      </div>

      <ResponsiveSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtres" size="sm"
        footer={filtersActive > 0 ? <Button variant="outline" onClick={() => update({ subject: "", type: "", year: "" })}>Retirer les filtres</Button> : undefined}>
        <div className="grid gap-6 pb-2">
          <ChoiceList label="Matière" value={query.subject} options={usedSubjects} onChange={(v) => update({ subject: v })} />
          <ChoiceList label="Type" value={query.type} options={types} onChange={(v) => update({ type: v })} />
          {years.length > 1 && <ChoiceList label="Année" value={query.year} options={years} onChange={(v) => update({ year: v })} />}
        </div>
      </ResponsiveSheet>
      <DocSheet doc={sheetDoc} onClose={() => openSheet(null)} viewerId={viewerId} />
      {confirm}
    </div>
  );
}

/** Pied de carte : chiffres d'un document publié, jauge de ce qui manque à un brouillon, attente ou motif sinon. */
function CardFooter({ doc, menu, onStats }: { doc: MyDoc; menu: React.ReactNode; onStats: () => void }) {
  let body: React.ReactNode;
  if (doc.status === "draft") {
    const { missing, progress } = draftMissing(doc);
    body = missing.length ? (
      <span className="grid w-full gap-1.5">
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Prêt à envoyer">
          <span className="block h-full rounded-full bg-brand-text transition-[width] duration-(--dur-slow) ease-out" style={{ width: `${progress}%` }} />
        </span>
        <span className="text-muted-foreground">Manque : {missing.join(", ")}</span>
      </span>
    ) : <span className="text-muted-foreground">Prêt à envoyer</span>;
  } else if (doc.status === "pending" && doc.waitingSince) {
    body = <span className="text-muted-foreground">Envoyé le {new Date(doc.waitingSince).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>;
  } else if (doc.status === "tofix") {
    body = <span className="line-clamp-2 text-warning-foreground">{doc.reviewNote}</span>;
  } else if (doc.status === "trash") {
    const left = doc.trashDaysLeft ?? TRASH_DAYS;
    body = <span className="text-muted-foreground">Encore {left} jour{left > 1 ? "s" : ""}</span>;
  } else {
    body = (
      <button type="button" onClick={onStats} className="-m-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md p-1 text-muted-foreground tabular-nums hover:text-foreground" aria-label="Statistiques et fil">
        <span className="flex items-center gap-1" title="Lecteurs"><Icon icon={IconPeople} size={16} />{doc.readers.toLocaleString("fr-FR")}</span>
        {doc.ratingAvg !== null && <span className="flex items-center gap-1" title="Note moyenne"><Icon icon={IconFavorite} size={16} filled className="size-3.5" />{formatRating(doc.ratingAvg)}</span>}
        {doc.openQuestions > 0 && <span className="flex items-center gap-1" title="Questions sans réponse"><Icon icon={IconRequests} size={16} />{doc.openQuestions}</span>}
      </button>
    );
  }
  return <div className="flex items-center justify-between gap-2">{body}{menu}</div>;
}

/** Puce de filtre : « Matière » au repos, « Matière : Droit civil » une fois choisie, avec sa croix. */
function FilterChip({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  const chosen = options.find((o) => o.value === value);
  if (!options.length) return null;
  return (
    <span className={cn("inline-flex items-center rounded-full border", chosen ? "border-transparent bg-brand-tint text-brand-text" : "border-input")}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="rounded-full hover:bg-transparent" />}>
          {chosen ? <><span className="font-normal">{label} :</span> {chosen.label}</> : <>{label}<Icon icon={IconExpand} size={16} className="text-muted-foreground" /></>}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-48">
          <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => onChange(v)}>
            <DropdownMenuRadioItem value="">Tout</DropdownMenuRadioItem>
            {options.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {chosen && <Button variant="ghost" size="icon-xs" className="-ml-1 mr-1 rounded-full hover:bg-brand-text/10" aria-label={`Retirer le filtre ${label}`} onClick={() => onChange("")}><Icon icon={IconClose} size={16} /></Button>}
    </span>
  );
}

function SortMenu({ value, onChange }: { value: MyQuery["sort"]; onChange: (value: MyQuery["sort"]) => void }) {
  const label = MY_SORTS.find((s) => s.value === value)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={`Trier : ${label}`} />}><Icon icon={IconSort} size={16} />{label}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => onChange(v as MyQuery["sort"])}>
          {MY_SORTS.map((s) => <DropdownMenuRadioItem key={s.value} value={s.value}>{s.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Au téléphone, dans la feuille : une liste de choix par filtre, cible de 44 px. */
function ChoiceList({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  if (!options.length) return null;
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {[{ value: "", label: "Tout" }, ...options].map((o) => (
          <Button key={o.value} variant="outline" size="sm" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
            className="rounded-full aria-pressed:border-transparent aria-pressed:bg-brand-tint aria-pressed:text-brand-text">{o.label}</Button>
        ))}
      </div>
    </fieldset>
  );
}
