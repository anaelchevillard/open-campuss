import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { cn } from "cn";
import { AnnouncementBar } from "@/components/announcement-bar";
import { AppSidebar, TabBar, TopBar, type SemesterNav } from "@/components/app-nav";
import { Avatar } from "@/components/avatar";
import { CommandPalette } from "@/components/command-palette";
import { CreateSheetProvider } from "@/components/create-sheet";
import { IndependenceNotice } from "@/components/independence";
import { InstallHint } from "@/components/install-hint";
import { Logo } from "@/components/logo";
import { pageContainer, type PageWidth } from "@/components/page-container";
import { PageTitleProvider } from "@/components/page-title";
import { BadgeToast } from "@/components/profile/badge-toast";
import { ReadingSettings } from "@/components/reading-settings";
import { ConsentLink } from "@/components/tracker";
import { NativeBackGuard, PageTransition } from "@/components/view-transition";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { aiAvailable } from "@/lib/ai-available";
import { LEVELS } from "@/lib/db/categories";
import type { User } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { BADGES, levelOf } from "@/lib/gamification";
import { chosenParity, currentParity, SEMESTER_COOKIE, subjectsForSemester } from "@/lib/semester";
import { shellCounters } from "@/lib/shell-counters";
import { featureOn } from "@/lib/site-settings";
import { HOME } from "@/lib/home";

function Footer({ app }: { app?: boolean }) {
  return (
    <footer className={cn("mt-auto border-t border-border", app && "pb-[var(--bottom-offset)]")}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-4 text-sm text-muted-foreground md:px-8">
        <nav aria-label="Informations" className="flex flex-wrap items-center gap-x-4 gap-y-1 [&>*]:py-1">
          <Link className="hover:text-foreground" href="/cgu">Conditions</Link>
          <Link className="hover:text-foreground" href="/confidentialite">Confidentialité</Link>
          <Link className="hover:text-foreground" href="/credits">Mentions et crédits</Link>
          <Link className="hover:text-foreground" href="/contact">Signaler ou nous écrire</Link>
          <ConsentLink />
        </nav>
        {!app && <span className="ml-auto"><ReadingSettings /></span>}
        <IndependenceNotice className="w-full" />
      </div>
    </footer>
  );
}

export { Footer };
export { PageHead, PageHeader } from "@/components/page-header";

/**
 * Coquille des pages connectées : barre latérale (≥ 1024 px), barre d'onglets et en-tête (< 1024 px), feuille « Commencer avec… ».
 * `width` : type de page du conteneur partagé (`pageContainer`) : `standard` par défaut, `reading` (cours, éditeur), `wide` (administration, tableaux).
 */
export async function Shell({ user, children, width = "standard" }: { user: User; children: ReactNode; width?: PageWidth }) {
  const store = await cookies();
  const level = Number(store.get("campuss-annee")?.value) || user.level || 1;
  const teacher = user.role === "teacher";
  const [counters, current, ai, imports] = await Promise.all([
    shellCounters(user),
    user.programId && !teacher ? currentParity(user) : Promise.resolve(1 as const),
    aiAvailable(),
    featureOn("imports"),
  ]);
  const parity = chosenParity(undefined, store.get(SEMESTER_COOKIE)?.value, current);
  const subjects = user.programId && !teacher ? await subjectsForSemester(user.programId, level, parity) : [];
  const semester: SemesterNav | null = user.programId && !teacher
    ? { level, parity, current, levels: [...LEVELS], subjects: subjects.map((s) => ({ id: s.id, name: s.name })) }
    : null;
  const fresh = counters.unseenBadges.flatMap((id) => BADGES.filter((b) => b.id === id).map((b) => ({ id: b.id, name: b.name })));
  const moderator = user.role === "admin" || user.role === "delegate";
  const pages: [string, string, string][] = teacher
    ? [["/enseignant", "Mes matières", "Page"], ["/notifications", "Notifications", "Page"], ["/parametres", "Paramètres", "Page"]]
    : [
      [HOME, "Accueil", "Lecture"], ["/matieres", "Matières", "Lecture"], ["/reviser", "Réviser", "Lecture"], ["/reviser/partiels", "Partiels", "Lecture"], ["/amis", "Amis", "Lecture"], ["/reviser/ensemble", "Réviser à plusieurs", "Lecture"],
      ["/contribuer/nouveau", "Nouveau document", "Édition"], ["/contribuer", "Mes documents", "Édition"],
      ...(moderator ? [["/moderation", "À valider", "Édition"] as [string, string, string]] : []),
      ...(user.role === "admin" ? [["/admin", "À traiter", "Administration"], ["/admin/personnes", "Personnes", "Administration"], ["/admin/contenus", "Contenus", "Administration"], ["/admin/statistiques", "Statistiques", "Administration"]] as [string, string, string][] : []),
      ["/reviser/classement", "Classement", "Compte"], ["/notifications", "Notifications", "Compte"], ["/parametres", "Paramètres", "Compte"], ["/actualites", "Actualités", "Infos"],
    ];
  const sidebarCookie = store.get("sidebar_state")?.value;
  const counts = { toReview: counters.toReview, pending: counters.pendingAccounts, reports: counters.openReports, invites: counters.invites, friends: counters.friendRequests, dueCards: counters.dueCards };
  const avatar = <Avatar user={user} size={32} />;
  const createOptions = { ai, files: imports, notion: imports && Boolean(env.notionOauthClientId), google: imports && Boolean(env.googleOauthClientId) };
  return (
    <PageTitleProvider>
      <CreateSheetProvider options={createOptions}>
        <SidebarProvider defaultOpen={sidebarCookie !== "false"} className="flex-1">
          <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground">Aller au contenu</a>
          <AppSidebar role={user.role} name={user.name} rank={teacher ? "Enseignant" : `${levelOf(counters.credits).name} · ${counters.credits} crédits`} profileHref={`/u/${user.id}`} avatar={avatar} counts={counts} semester={semester} chosen={sidebarCookie !== undefined} />
          <SidebarInset className="min-w-0 bg-background">
            <TopBar role={user.role} unread={counters.unreadNotifications} search={<CommandPalette pages={pages.map(([href, title, hint]) => ({ href, title, hint }))} />} />
            <AnnouncementBar />
            <main id="contenu" className={cn(pageContainer(width), "flex-1 max-lg:overflow-x-clip")}>
              <PageTransition>{children}</PageTransition>
            </main>
            <Footer app />
          </SidebarInset>
          <TabBar role={user.role} counts={counts} />
          <NativeBackGuard />
          <BadgeToast badges={fresh} />
          <InstallHint />
        </SidebarProvider>
      </CreateSheetProvider>
    </PageTitleProvider>
  );
}

/** Pages publiques : le formulaire, rien d'autre. */
export function PublicShell({ title, intro, children }: { title?: string; intro?: string; children: ReactNode }) {
  return (
    <>
      <main className="page-enter flex flex-1 flex-col items-center px-4 pt-[10vh] pb-12">
        <div className="w-full max-w-sm">
          {/* Navigation complète : la présentation reçoit sa propre politique (WebAssembly du téléphone 3D, voir lib/csp.ts) */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète voulue (CSP de la présentation) */}
          <a href="/" aria-label="Campuss" className="inline-block rounded-sm"><Logo className="h-7 w-auto" /></a>
          {title && <h1 className="title mt-8">{title}</h1>}
          {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
