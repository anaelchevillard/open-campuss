import "server-only";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Polices du premier affichage : Massilia (titres) et Source Sans 3 latin droit (texte). fonts.css les déclare sans
 * next/font (qui renommerait les familles) ; le build leur donne une adresse hachée dans /_next/static/media, lue ici une
 * fois au démarrage pour les précharger. Sans dossier (développement), rien n'est préchargé : seul l'affichage attend.
 */
const CRITICAL = [/^massilia-vf\.[\w-]+\.woff2$/, /^source-sans-3-latin-wght-normal\.[\w-]+\.woff2$/];

let cached: readonly string[] | undefined;

export function criticalFontUrls(dir = join(process.cwd(), ".next", "static", "media")): readonly string[] {
  if (cached) return cached;
  let files: string[] = [];
  try {
    // Lecture à l'exécution seulement : rien à suivre pour le build (sinon tout le projet entrerait dans le serveur)
    files = readdirSync(/* turbopackIgnore: true */ dir);
  } catch {
    files = [];
  }
  cached = CRITICAL.flatMap((re) => files.filter((f) => re.test(f)).slice(0, 1)).map((f) => `/_next/static/media/${f}`);
  return cached;
}

/** Pour les tests. */
export function forgetCriticalFonts() {
  cached = undefined;
}
