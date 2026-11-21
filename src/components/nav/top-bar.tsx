"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, addTransitionType, useEffect, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { usePageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { backTarget } from "@/components/nav/back-target";
import { useMode } from "@/components/nav/use-mode";
import { IconBack } from "@/lib/icons";
import type { Role } from "@/lib/modes";
import { HOME } from "@/lib/home";

// Pages de premier niveau (logo, pas de retour) : un onglet ou une entrée de la barre latérale y mène directement, onglets internes de Réviser compris
const ROOTS = new Set([HOME, "/matieres", "/reviser", "/reviser/partiels", "/reviser/ensemble", "/reviser/classement", "/moi", "/demandes", "/amis", "/contribuer", "/moderation", "/moderation/calendrier", "/enseignant", "/admin", "/admin/contenus", "/admin/personnes", "/admin/suivi"]);
// Pages ouvertes depuis Moi : leur retour y ramène, même sans historique
const fromMe = (pathname: string) => pathname === "/notifications" || pathname === "/amis" || pathname.startsWith("/parametres");
// Écran précédent dans l'application (l'en-tête est remonté à chaque page : on le garde hors du composant)
const visited = { previous: null as string | null, current: null as string | null };

/** En-tête : au téléphone, logo ou retour, titre de l'écran, loupe et cloche ; sur grand écran, la recherche et la cloche. */
export function TopBar({ role, search, unread }: { role: Role; search: ReactNode; unread: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = usePageTitle();
  const mode = useMode(role);
  // Amis est un onglet en Lecture ; ailleurs, on y arrive depuis Moi
  const root = ROOTS.has(pathname) && !(pathname === "/amis" && mode !== "read");
  const query = useSearchParams();
  const parent = backTarget(pathname, query);
  useEffect(() => {
    if (visited.current !== pathname) { visited.previous = visited.current; visited.current = pathname; }
  }, [pathname]);
  const back = () => {
    // Parente nommée : on y revient par l'historique si l'on en vient, sinon on y va (le nom affiché reste vrai)
    if (parent && visited.previous !== parent.href) startTransition(() => { addTransitionType("nav-back"); router.replace(parent.href); });
    else if (window.history.length > 1) startTransition(() => { addTransitionType("nav-back"); router.back(); });
    else router.push(fromMe(pathname) ? "/moi" : HOME);
  };
  return (
    <header style={{ viewTransitionName: "app-header" }} className="sticky top-0 z-(--z-header) border-b border-transparent bg-background pt-safe lg:bg-background/90 lg:backdrop-blur-md">
      <div className="flex h-14 items-center gap-1 px-2 md:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-1 lg:hidden">
          {root
            ? <Link href={HOME} aria-label="Campuss" className="flex min-h-11 shrink-0 items-center px-2"><Logo className="h-5 w-auto" /></Link>
            : parent
              ? <Button variant="ghost" onClick={back} aria-label={`Retour : ${parent.label}`} className="shrink-0 gap-0.5 px-1.5 text-brand-text"><Icon icon={IconBack} size={24} />{parent.label}</Button>
              : <Button variant="ghost" size="icon" onClick={back} aria-label="Retour"><Icon icon={IconBack} size={24} /></Button>}
          {!root && title && title !== parent?.label && <span className="truncate px-1 text-base font-semibold">{title}</span>}
        </div>
        <div className="flex items-center gap-1 lg:flex-1">{search}</div>
        <NotificationBell key={unread} initialUnread={unread} />
      </div>
    </header>
  );
}
