import { cn } from "cn";
import type { ShotSize } from "./data";

/** Largeur affichée d'une capture d'écran de téléphone dans les maquettes (héros, récit, démonstrations). */
export const PHONE_SIZES = "(max-width: 1023px) 240px, 330px";

export type Theme = "light" | "dark";

/**
 * Condition des sources sombres : le thème choisi dans les réglages (classe light/dark sur <html>) l'emporte sur le
 * système. Rendue par le serveur d'après les préférences, puis tenue à jour par landing-fx quand on change de thème
 * sur la page : le navigateur choisit à nouveau l'image sans rien télécharger en double.
 */
export const darkMedia = (forced: Theme | null | undefined) => forced === "dark" ? "all" : forced === "light" ? "not all" : "(prefers-color-scheme: dark)";

const src = (name: string, theme: "light" | "dark", ext: "avif" | "webp", width: number) =>
  `/presentation/${name}-${theme}.${ext} ${width}w, /presentation/${name}-${theme}@2x.${ext} ${width * 2}w`;

/**
 * Capture réelle de l'interface (jeu de démonstration), claire ou sombre comme la page (thème des réglages, sinon le
 * système), en AVIF avec repli WebP.
 * Deux tailles (1x et 2x) décrites par leur largeur : avec `sizes`, le navigateur prend la plus petite qui suffit à
 * l'écran (un téléphone ne charge pas la 2x d'une capture affichée en petit). Dimensions explicites : aucun décalage
 * au chargement. Seul le héros est prioritaire. `cover` : remplit l'écran d'une maquette.
 */
export function Shot({ name, size, alt, sizes, priority, cover, className, theme }: { name: string; size: ShotSize; alt: string; sizes?: string; priority?: boolean; cover?: boolean; className?: string; theme?: Theme | null }) {
  const s = sizes ?? (cover ? PHONE_SIZES : "(max-width: 1100px) 100vw, 1024px");
  const dark = darkMedia(theme);
  return (
    <picture>
      <source data-theme="dark" type="image/avif" media={dark} srcSet={src(name, "dark", "avif", size.width)} sizes={s} />
      <source data-theme="dark" type="image/webp" media={dark} srcSet={src(name, "dark", "webp", size.width)} sizes={s} />
      <source type="image/avif" srcSet={src(name, "light", "avif", size.width)} sizes={s} />
      {/* Images préparées à l'avance : l'optimiseur Next est coupé */}
      <img
        src={`/presentation/${name}-light.webp`} srcSet={src(name, "light", "webp", size.width)} sizes={s} alt={alt} width={size.width} height={size.height}
        loading={priority ? "eager" : "lazy"} decoding={priority ? "sync" : "async"} fetchPriority={priority ? "high" : "auto"}
        className={cn("block w-full", cover ? "h-full object-cover object-top" : "h-auto", className)}
      />
    </picture>
  );
}
