import { HOME } from "@/lib/home";
/** Les quatre espaces de Campuss. Le mode se déduit de l'URL : un lien partagé ouvre toujours le bon espace. */
export type Mode = "read" | "edit" | "admin" | "teach";
export type Role = "member" | "contributor" | "delegate" | "teacher" | "admin";

export const MODE_LABELS: Record<Mode, string> = { read: "Lecture", edit: "Édition", admin: "Administration", teach: "Enseignant" };

const EDIT = ["/contribuer", "/editer", "/corriger", "/moderation", "/admin/documents/new"];
// Pages communes à tous les espaces (Moi, notifications, paramètres, demandes, pied de page) : elles gardent l'espace d'où l'on vient
const SHARED = ["/moi", "/notifications", "/parametres", "/actualites", "/demandes", "/amis", "/cgu", "/confidentialite", "/credits", "/contact"];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isSharedPage(pathname: string) {
  return SHARED.some((p) => under(pathname, p));
}

/** `previous` : l'espace où l'on était, gardé sur les pages communes. */
export function modeOf(pathname: string, role: Role, previous?: Mode): Mode {
  if (role === "teacher") return "teach";
  if (previous && previous !== "teach" && isSharedPage(pathname) && modesOf(role).some((m) => m.mode === previous)) return previous;
  if (EDIT.some((p) => under(pathname, p))) return "edit";
  if (under(pathname, "/admin")) return role === "admin" ? "admin" : "read";
  return "read";
}

export function modesOf(role: Role): { mode: Mode; href: string }[] {
  if (role === "teacher") return [];
  return [
    { mode: "read", href: HOME },
    { mode: "edit", href: role === "admin" || role === "delegate" ? "/moderation" : "/contribuer" },
    ...(role === "admin" ? [{ mode: "admin" as const, href: "/admin" }] : []),
  ];
}

// Écrire passe par le même chemin pour tous. Un site, un artefact ou une page Notion restent dans « Mes documents » pour un administrateur
export const newDocumentHref = (_role: Role, subject?: number) => `/contribuer/nouveau${subject ? `?matiere=${subject}` : ""}`;

export const isCurrent = (pathname: string, href: string) => {
  const path = href.split("?")[0];
  if (path === "/matieres") return under(pathname, "/matieres") || pathname.startsWith("/d/");
  return under(pathname, path);
};
