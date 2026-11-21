"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { answerFriendRequest } from "@/app/actions/friends";
import { findPeople } from "@/app/actions/people";
import { askFriend } from "@/app/actions/social";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserName } from "@/components/user-name";
import type { PersonResult } from "@/lib/people";
import { SEARCH_MIN } from "@/lib/people-rules";
import { IconAddFriend, IconClose, IconDone, IconSearch } from "@/lib/icons";
import { toastError } from "@/lib/toast";

const DEBOUNCE_MS = 300;

type Search = { term: string; people: PersonResult[]; error: string | null };

/** Barre de recherche de personnes : la recherche part au serveur après une courte pause ; `onActive` cache le reste de la page. */
export function PeopleSearch({ onActive }: { onActive: (active: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Search | null>(null);
  const term = query.trim();
  const active = term.length >= SEARCH_MIN;

  useEffect(() => { onActive(active); }, [active, onActive]);
  useEffect(() => {
    if (!active) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await findPeople(term).catch(() => ({ error: "Recherche impossible pour l’instant" }));
      if (!stale) setFound("people" in result ? { term, people: result.people, error: null } : { term, people: [], error: result.error });
    }, DEBOUNCE_MS);
    return () => { stale = true; clearTimeout(timer); };
  }, [term, active]);

  const loading = active && found?.term !== term;
  return (
    <div className="grid gap-3">
      <div className="relative">
        <Icon icon={IconSearch} size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher quelqu’un sur Campuss" aria-label="Rechercher une personne par son nom"
          maxLength={60} autoComplete="off" enterKeyHint="search" className="h-12 rounded-full pr-12 pl-10 text-base shadow-xs" />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche"
            className="absolute top-1/2 right-1.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <Icon icon={IconClose} size={16} />
          </button>
        )}
      </div>
      {active && (
        <section aria-label="Résultats de la recherche" aria-busy={loading} className="grid gap-2">
          {found?.error ? <p className="text-sm text-destructive">{found.error}</p>
            : loading && !found?.people.length ? <p className="text-sm text-muted-foreground">Recherche…</p>
            : found && !found.people.length ? <p className="text-sm text-muted-foreground">Personne de ce nom. Certaines personnes choisissent de ne pas apparaître dans la recherche.</p>
            : <ul className="grid gap-1">{found?.people.map((person) => <PersonRow key={person.id} person={person} />)}</ul>}
        </section>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: PersonResult }) {
  const [relation, setRelation] = useState(person.relation);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const add = async () => {
    setBusy(true);
    const result = await askFriend(person.id);
    setBusy(false);
    if (result.ok) setRelation("sent"); else toastError(result.error);
  };
  const accept = async () => {
    setBusy(true);
    await answerFriendRequest(person.id, true);
    setBusy(false);
    setRelation("friends");
    router.refresh();
  };
  return (
    <li className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover-ok:bg-muted">
      <Link href={`/u/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar user={person} size={44} />
        <span className="grid min-w-0">
          <UserName user={person} profile={person.profile} variant="rich" showBadge list className="truncate" />
          {person.program && <span className="truncate text-xs text-muted-foreground">{person.program}</span>}
        </span>
      </Link>
      {relation === "friends" ? <span className="inline-flex min-h-9 items-center gap-1 px-2 text-sm font-semibold text-muted-foreground"><Icon icon={IconDone} size={16} />Ami</span>
        : relation === "sent" ? <span className="inline-flex min-h-9 items-center px-2 text-sm text-muted-foreground">Demande envoyée</span>
        : relation === "received" ? <Button size="sm" pending={busy} onClick={accept}>Accepter</Button>
        : <Button size="sm" variant="outline" pending={busy} onClick={add}><Icon icon={IconAddFriend} size={16} />Ajouter</Button>}
    </li>
  );
}
