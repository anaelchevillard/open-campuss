import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Maquettes dessinées ici (aucune image d'Apple : leurs « Product Bezels » sont réservés aux apps de l'App Store
 * et interdits en 3D). Cotes tirées de l'appareil réel et exprimées en unités de conteneur (cqw), pour que tout
 * suive la largeur : voir landing.css (.lp-iphone, .lp-safari, .lp-tablet) et AUDIT-PRESENTATION.md.
 */

/**
 * Téléphone : cadre en titane bordeaux, verre noir, île, boutons latéraux. L'écran a les proportions exactes de la
 * capture (393 × 852 points) : la capture porte elle-même sa barre d'état et son indicateur d'accueil, dans la zone sûre
 * (scripts/capture-showcase.mjs), et l'île se pose dans la marge du haut sans rien cacher ; la barre d'onglets est entière.
 */
export function IPhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("lp-iphone", className)}>
      <span aria-hidden="true" className="lp-iphone-key" data-key="action" />
      <span aria-hidden="true" className="lp-iphone-key" data-key="up" />
      <span aria-hidden="true" className="lp-iphone-key" data-key="down" />
      <span aria-hidden="true" className="lp-iphone-key" data-key="power" />
      <div className="lp-iphone-body">
        <div className="lp-iphone-screen">
          <div className="lp-iphone-view">{children}</div>
          <span aria-hidden="true" className="lp-iphone-island" />
        </div>
      </div>
    </div>
  );
}

/** Tablette en portrait : bord régulier, caméra au centre du bord haut. */
export function TabletFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("lp-tablet", className)}>
      <div className="lp-tablet-body">
        <span aria-hidden="true" className="lp-tablet-cam" />
        <div className="lp-tablet-screen">{children}</div>
      </div>
    </div>
  );
}

const glyph = "fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round]";

/** Fenêtre Safari de macOS : feux, barre latérale, précédent/suivant, champ d'adresse centré, partage, onglets. */
export function SafariWindow({ children, className, url = "campuss.fr" }: { children: ReactNode; className?: string; url?: string }) {
  return (
    <div className={cn("lp-safari", className)}>
      <div aria-hidden="true" className="lp-safari-bar">
        <span className="lp-safari-lights"><i /><i /><i /></span>
        <svg viewBox="0 0 24 24" className={cn("lp-safari-tool", glyph)} strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M9 5v14" /></svg>
        <svg viewBox="0 0 24 24" className={cn("lp-safari-tool", glyph)} strokeWidth="1.8"><path d="m14.5 6-6 6 6 6" /></svg>
        <svg viewBox="0 0 24 24" className={cn("lp-safari-tool opacity-40", glyph)} strokeWidth="1.8"><path d="m9.5 6 6 6-6 6" /></svg>
        <span className="lp-safari-url">
          <svg viewBox="0 0 24 24" className={glyph} strokeWidth="2"><rect x="6" y="11" width="12" height="9" rx="2" /><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" /></svg>
          {url}
        </span>
        <svg viewBox="0 0 24 24" className={cn("lp-safari-tool", glyph)} strokeWidth="1.6"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" /></svg>
        <svg viewBox="0 0 24 24" className={cn("lp-safari-tool", glyph)} strokeWidth="1.8"><path d="M12 5v14M5 12h14" /></svg>
        <svg viewBox="0 0 24 24" className={cn("lp-safari-tool", glyph)} strokeWidth="1.6"><rect x="4" y="7" width="12" height="12" rx="2" /><path d="M8 4h9a3 3 0 0 1 3 3v9" /></svg>
      </div>
      <div className="lp-safari-view">{children}</div>
    </div>
  );
}
