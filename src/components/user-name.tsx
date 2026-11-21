import type { CSSProperties } from "react";
import { cn } from "cn";
import { NameBadge } from "@/components/profile/name-badge";
import type { NameStyle, UserProfile } from "@/lib/db/schema";
import { fontOf, gradientOf, hueColor, isHue } from "@/lib/name-style";

/** Variables CSS d'un style de nom : couleur imposée par le thème, dégradé à deux arrêts, police compensée. */
export function nameStyleVars(style: NameStyle | null | undefined, rich: boolean) {
  const vars: Record<string, string> = {};
  const data: Record<string, string> = {};
  const gradient = gradientOf(style?.gradient);
  if (gradient) {
    vars["--name-solid"] = hueColor(gradient.from);
    vars["--name-from"] = hueColor(gradient.from); vars["--name-to"] = hueColor(gradient.to); data["data-gradient"] = gradient.id;
  } else if (isHue(style?.hue)) {
    vars["--name-color"] = vars["--name-solid"] = hueColor(style.hue);
    data["data-hue"] = String(style.hue);
  }
  const font = fontOf(style?.font);
  if (font) { vars["--name-font"] = font.family; data["data-font"] = font.id; }
  if (rich && style?.effect === "reflet") data["data-effect"] = "reflet";
  return { vars, data };
}

/**
 * Nom d'une personne, avec sa police et sa couleur (ou son dégradé) partout où il apparaît.
 * `rich` (profil, fiche ami, ligue, classement, signature) ajoute le badge et le reflet.
 * Le réglage « Styles des autres », le mouvement réduit et la police de lecture de celui qui regarde passent par le CSS (name-fonts.css).
 * `self` : c'est le nom de la personne qui regarde ; `list` : nom dans une liste (sobre au téléphone).
 */
export function UserName({ user, profile, variant = "dense", showBadge, className, self, list }: { user: { id: string; name: string }; profile?: UserProfile | null; variant?: "dense" | "rich"; showBadge?: boolean; className?: string; self?: boolean; list?: boolean }) {
  const rich = variant === "rich";
  const { vars, data } = nameStyleVars(profile?.nameStyle, rich);
  const badge = showBadge && profile?.badgeShown ? profile.badgeShown : null;
  return (
    <span
      className={cn("user-name wrap-break-word", rich && "font-semibold", className)}
      style={vars as CSSProperties}
      data-self={self ? "" : undefined}
      data-list={list ? "" : undefined}
      {...data}
    >
      <span className="user-name-text">{user.name}</span>
      {badge && <>{" "}<NameBadge id={badge} /></>}
    </span>
  );
}
