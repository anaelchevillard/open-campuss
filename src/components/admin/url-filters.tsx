"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { Filters, type FilterField, type FilterQuery } from "@/components/reui/filters/filters";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { IconFilter, IconSearch } from "@/lib/icons";
import { useGridParams } from "@/components/admin/admin-grid";
import { mergeQuery, rulesFromParams, splitQuery } from "@/components/admin/url-filters-state";
import { Button } from "@/components/ui/button";

export type UrlFilterField = { id: string; label: string; options: { value: string; label: string }[] };

const LABELS = {
  addFilter: "Filtrer", addCondition: "Filtrer", clearAll: "Tout effacer", clear: "Effacer", apply: "Appliquer", back: "Retour", remove: "Retirer",
  searchFields: "Chercher un critère…", searchOperators: "Chercher…", searchOptions: "Chercher…", empty: "Aucun résultat", loading: "Chargement…",
  selectPlaceholder: "Choisir…", filtersLabel: "Filtres", fieldsLabel: "Critères", actionsLabel: "Actions", noValue: "aucune valeur", selectCondition: "Choisir",
  valueCount: (n: number) => `${n} choisis`, countAnnouncement: (n: number) => (n === 1 ? "1 filtre" : `${n} filtres`), resultsAnnouncement: (n: number) => (n === 1 ? "1 résultat" : `${n} résultats`),
  chipMenu: (label: string) => `Options du filtre ${label}`, duplicate: "Dupliquer", negate: "Inverser", discard: "Abandonner",
};
const OPERATORS = { is: "est", is_any_of: "est l’un de" };

/** Filtres ReUI dont l'état vit dans l'URL : un critère = un paramètre (plusieurs valeurs séparées par des virgules). */
export function UrlFilters({ fields, search = true, placeholder = "Chercher" }: { fields: UrlFilterField[]; search?: boolean; placeholder?: string }) {
  const { params, set } = useGridParams();
  const ids = fields.map((f) => f.id);
  const key = ids.join("|");
  // Un critère choisi sans valeur n'a pas sa place dans l'URL : il vit ici jusqu'au choix de la valeur
  const [local, setLocal] = useState<{ at: string | null; rules: ReturnType<typeof splitQuery>["rules"] }>({ at: null, rules: [] });
  const query: FilterQuery<string | string[]> = useMemo(
    () => mergeQuery(rulesFromParams(key.split("|"), (id) => params.get(id)), local.rules, local.at === params.toString()),
    [params, key, local],
  );
  const schema: FilterField<string | string[]>[] = fields.map((f) => ({
    id: f.id, label: f.label, type: "select", options: f.options, searchable: f.options.length > 8,
    operators: [{ value: "is", label: OPERATORS.is }, { value: "is_any_of", label: OPERATORS.is_any_of, arity: "many" }],
  }));
  const onChange = (next: FilterQuery<string | string[]>) => {
    const { patch, rules } = splitQuery(ids, next);
    setLocal({ at: params.toString(), rules });
    // Rien ne change dans l'URL (critère seulement choisi) : pas de navigation inutile
    if (ids.every((id) => (patch[id] ?? null) === (params.get(id) ?? null))) return;
    set(patch);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search && <SearchBox placeholder={placeholder} />}
      <Filters fields={schema} query={query} onQueryChange={onChange} labels={LABELS as never} operatorLabels={OPERATORS} showClear size="default"
        trigger={<Button variant="outline"><Icon icon={IconFilter} size={16} />Filtrer</Button>} />
    </div>
  );
}

/** Recherche serveur : 300 ms après la frappe, « / » y place le curseur. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const { params, set } = useGridParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const input = useRef<HTMLInputElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const timer = setTimeout(() => set({ q: value.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || document.documentElement.classList.contains("no-shortcuts")) return;
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <InputGroup className="w-full sm:w-72">
      <InputGroupAddon><Icon icon={IconSearch} size={16} /></InputGroupAddon>
      <InputGroupInput ref={input} type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <InputGroupAddon align="inline-end" className="coarse:hidden"><Kbd>/</Kbd></InputGroupAddon>
    </InputGroup>
  );
}
