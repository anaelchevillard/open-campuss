"use client";

import Link from "next/link";
import { useState } from "react";
import { followProfile, followSubject } from "@/app/actions/people";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { UserName } from "@/components/user-name";
import type { UserProfile } from "@/lib/db/schema";
import { IconSubjects } from "@/lib/icons";
import { toastError } from "@/lib/toast";

type FollowedPerson = { id: string; name: string; avatarKey: string | null; profile: UserProfile | null };
type FollowedSubject = { id: number; name: string; level: number };
type Subject = { id: number; name: string };

const row = "flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover-ok:bg-muted";

/** Onglet Abonnements : les profils et les matières suivis, et les matières de sa licence à suivre en un geste. */
export function FollowList({ people, subjects, suggestions }: { people: FollowedPerson[]; subjects: FollowedSubject[]; suggestions: Subject[] }) {
  const [gonePeople, setGonePeople] = useState<string[]>([]);
  const [followed, setFollowed] = useState(() => new Set(subjects.map((s) => s.id)));
  const toggleSubject = async (id: number) => {
    const on = !followed.has(id);
    const next = (set: Set<number>, add: boolean) => { const copy = new Set(set); if (add) copy.add(id); else copy.delete(id); return copy; };
    setFollowed((set) => next(set, on));
    const result = await followSubject(id, on);
    if (!result.ok) { setFollowed((set) => next(set, !on)); toastError(result.error); }
  };
  const shownPeople = people.filter((p) => !gonePeople.includes(p.id));
  const allSubjects = [...subjects, ...suggestions.filter((s) => !subjects.some((f) => f.id === s.id))];
  return (
    <>
      <section aria-labelledby="abonnements-profils" className="grid min-w-0 grid-cols-1 gap-3">
        <div className="grid gap-1">
          <h2 id="abonnements-profils" className="heading">Profils</h2>
          <p className="text-sm text-muted-foreground">Leurs nouveaux cours arrivent dans tes notifications. Abonne-toi depuis un profil.</p>
        </div>
        {shownPeople.length ? (
          <ul className="grid grid-cols-1 gap-1">
            {shownPeople.map((person) => (
              <li key={person.id} className={row}>
                <Link href={`/u/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={person} size={40} />
                  <UserName user={person} profile={person.profile} list className="truncate font-semibold" />
                </Link>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={async () => {
                  setGonePeople((all) => [...all, person.id]);
                  const result = await followProfile(person.id, false);
                  if (!result.ok) { setGonePeople((all) => all.filter((id) => id !== person.id)); toastError(result.error); }
                }}>Se désabonner</Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Aucun profil suivi</p>}
      </section>
      <section aria-labelledby="abonnements-matieres" className="grid min-w-0 grid-cols-1 gap-3">
        <div className="grid gap-1">
          <h2 id="abonnements-matieres" className="heading">Matières</h2>
          <p className="text-sm text-muted-foreground">Un rappel par jour au plus quand un cours y est publié.</p>
        </div>
        {allSubjects.length ? (
          <ul className="grid grid-cols-1 gap-1">
            {allSubjects.map((subject) => {
              const on = followed.has(subject.id);
              return (
                <li key={subject.id} className={row}>
                  <Link href={`/matieres/${subject.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Icon icon={IconSubjects} className="text-muted-foreground" />
                    <span className="truncate font-semibold">{subject.name}</span>
                  </Link>
                  <Button size="sm" variant={on ? "ghost" : "outline"} className="shrink-0" aria-pressed={on} onClick={() => void toggleSubject(subject.id)}>{on ? "Abonné" : "S’abonner"}</Button>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Aucune matière dans ta licence pour l’instant</p>}
      </section>
    </>
  );
}
