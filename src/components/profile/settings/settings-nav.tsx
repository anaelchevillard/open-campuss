"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { IconSearch } from "@/lib/icons";
import { SECTIONS, SETTINGS_INDEX, sectionHref, settingHref, type SectionId } from "./sections";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Recherche dans les réglages : quelques lettres suffisent, le résultat mène à la section et au bon endroit. */
export function useSettingsSearch(allowed: SectionId[]) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (q.length < 2) return [];
    return SETTINGS_INDEX.filter((e) => allowed.includes(e.section) && fold(`${e.label} ${e.words ?? ""}`).includes(q)).slice(0, 8);
  }, [query, allowed]);
  return { query, setQuery, results };
}

export function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Icon icon={IconSearch} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Rechercher un réglage" aria-label="Rechercher un réglage" className="pl-9 text-base" />
    </div>
  );
}

export function SearchResults({ results }: { results: typeof SETTINGS_INDEX }) {
  if (!results.length) return <p className="px-3 py-2 text-sm text-muted-foreground">Aucun réglage de ce nom</p>;
  return (
    <ul className="grid gap-0.5">
      {results.map((r) => {
        const section = SECTIONS.find((s) => s.id === r.section)!;
        return (
          <li key={`${r.section}-${r.label}`}>
            <Link href={settingHref(r.section, r.anchor)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-muted fine:min-h-9">
              <Icon icon={section.icon} className="text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="block font-semibold">{r.label}</span><span className="block text-muted-foreground">{section.label}</span></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Colonne de gauche sur ordinateur : une simple liste, l'élément actif en teinte de marque.
 * `current` : section active hors de /parametres (la personnalisation du profil vit sur /u/…).
 */
export function SettingsNav({ allowed, current }: { allowed: SectionId[]; current?: SectionId }) {
  const pathname = usePathname();
  const { query, setQuery, results } = useSettingsSearch(allowed);
  const sections = SECTIONS.filter((s) => allowed.includes(s.id));
  const groups = [...new Set(sections.map((s) => s.group))];
  return (
    <nav aria-label="Sections des paramètres" className="grid content-start gap-4">
      <SearchBox value={query} onChange={setQuery} />
      {query.trim().length >= 2 ? <SearchResults results={results} /> : groups.map((group) => (
        <div key={group} className="grid gap-0.5">
          <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">{group}</p>
          {sections.filter((s) => s.group === group).map((s) => {
            const active = current ? current === s.id : pathname === sectionHref(s.id);
            return (
              <Link key={s.id} href={sectionHref(s.id)} aria-current={active ? "page" : undefined}
                className={cn("flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors", active ? "bg-brand-tint font-semibold text-brand-text" : "text-foreground hover:bg-muted")}>
                <Icon icon={s.icon} className={active ? "" : "text-muted-foreground"} />{s.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Au téléphone, dans Moi : la recherche dans les réglages, au-dessus de la liste des sections. */
export function SettingsSearch({ allowed }: { allowed: SectionId[] }) {
  const { query, setQuery, results } = useSettingsSearch(allowed);
  return (
    <div className="grid gap-2">
      <SearchBox value={query} onChange={setQuery} />
      {query.trim().length >= 2 && <div className="rounded-xl bg-card p-2 shadow-xs"><SearchResults results={results} /></div>}
    </div>
  );
}
