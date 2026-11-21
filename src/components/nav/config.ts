import { IconCalendar, IconContent, IconFriends, IconHome, IconJournal, IconLicences, IconMe, IconModeEdit, IconNews, IconNotifications, IconPeople, IconRequests, IconRevise, IconStats, IconSubjects, IconTodo, IconFlag, IconAnnouncement, IconInvite, IconSystemHealth, IconErrors, IconSiteSettings, type IconData } from "@/lib/icons";
import type { Mode, Role } from "@/lib/modes";
import { HOME } from "@/lib/home";

export type NavItem = { href: string; label: string; icon?: IconData; count?: number };
export type NavGroup = { title?: string; items: NavItem[] };
export type NavCounts = { toReview: number; pending: number; reports: number; invites: number; friends: number; dueCards: number };

/** Barre latérale (≥ 1024 px), par espace : DESIGN.md §5.2. */
export function sidebarGroups(mode: Mode, role: Role, c: NavCounts): NavGroup[] {
  if (mode === "teach") return [{ items: [{ href: "/enseignant", label: "Mes matières", icon: IconSubjects }] }];
  if (mode === "admin") return [
    { items: [{ href: "/admin", label: "À traiter", icon: IconTodo, count: c.pending + c.reports }] },
    { title: "Contenus", items: [{ href: "/admin/contenus", label: "Cours", icon: IconContent }, { href: "/admin/moderation", label: "Modération", icon: IconFlag, count: c.reports }, { href: "/admin/licences", label: "Licences et matières", icon: IconLicences }, { href: "/admin/actualites", label: "Actualités", icon: IconNews }, { href: "/admin/annonces", label: "Annonces", icon: IconAnnouncement }] },
    { title: "Personnes", items: [{ href: "/admin/personnes", label: "Personnes", icon: IconPeople, count: c.pending }, { href: "/admin/invitations", label: "Invitations", icon: IconInvite }] },
    { title: "Suivi", items: [{ href: "/admin/statistiques", label: "Statistiques", icon: IconStats }, { href: "/admin/journal", label: "Journal", icon: IconJournal }, { href: "/admin/erreurs", label: "Erreurs", icon: IconErrors }, { href: "/admin/systeme", label: "Système", icon: IconSystemHealth }, { href: "/admin/reglages", label: "Réglages", icon: IconSiteSettings }] },
  ];
  if (mode === "edit") {
    const staff = role === "admin" || role === "delegate";
    return [{ items: [
      ...(staff ? [{ href: "/moderation", label: "À valider", icon: IconTodo, count: c.toReview }] : []),
      { href: "/contribuer", label: "Mes documents", icon: IconModeEdit },
      ...(staff ? [{ href: "/moderation/calendrier", label: "Dates", icon: IconCalendar }] : [{ href: "/demandes", label: "Demandes", icon: IconRequests }]),
    ] }];
  }
  return [{ items: [
    { href: HOME, label: "Accueil", icon: IconHome },
    { href: "/matieres", label: "Matières", icon: IconSubjects },
    { href: "/reviser", label: "Réviser", icon: IconRevise, count: c.dueCards + c.invites },
    { href: "/demandes", label: "Demandes", icon: IconRequests },
    { href: "/amis", label: "Amis", icon: IconFriends, count: c.friends },
  ] }];
}

/** Barre d'onglets (< 1024 px) : 5 cases, le + au centre (null). Elle dépend du mode seulement, jamais de la page. */
export function tabItems(mode: Mode, role: Role, c: NavCounts): (NavItem | null)[] {
  const me = { href: "/moi", label: "Moi", icon: IconMe };
  if (mode === "teach") return [{ href: "/enseignant", label: "Matières", icon: IconSubjects }, { href: "/notifications", label: "Alertes", icon: IconNotifications }, me];
  if (mode === "admin") return [
    { href: "/admin", label: "À traiter", icon: IconTodo, count: c.pending + c.reports },
    { href: "/admin/contenus", label: "Contenus", icon: IconContent },
    { href: "/admin/personnes", label: "Personnes", icon: IconPeople, count: c.pending },
    { href: "/admin/suivi", label: "Suivi", icon: IconStats },
    me,
  ];
  if (mode === "edit") {
    const staff = role === "admin" || role === "delegate";
    return staff
      ? [{ href: "/moderation", label: "À valider", icon: IconTodo, count: c.toReview }, { href: "/contribuer", label: "Documents", icon: IconModeEdit }, null, { href: "/moderation/calendrier", label: "Dates", icon: IconCalendar }, me]
      : [{ href: "/contribuer", label: "Documents", icon: IconModeEdit }, { href: "/demandes", label: "Demandes", icon: IconRequests }, null, me];
  }
  return [
    { href: HOME, label: "Accueil", icon: IconHome },
    { href: "/reviser", label: "Réviser", icon: IconRevise, count: c.dueCards + c.invites },
    null,
    { href: "/amis", label: "Amis", icon: IconFriends, count: c.friends },
    me,
  ];
}

/** Lien actif : le plus long qui correspond, une sous-page n'allume pas sa voisine. */
export function currentHref(items: NavItem[], pathname: string, isCurrent: (pathname: string, href: string) => boolean) {
  return items.filter((i) => isCurrent(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
