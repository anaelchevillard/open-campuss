import { safeRelativePath } from "@/lib/content-utils";

/**
 * L'artefact HTML inséré comme bloc dans un cours. Fonctions pures, partagées par l'éditeur, le
 * serveur (route /embed de l'origine de contenu) et les tests.
 *
 * Format Markdown (enregistré par l'éditeur, accepté à l'import) :
 *   ::artifact{src="/files/<uuid>" entry="index.html" title="Simulation de l'offre" display="bloc"}
 * - `src` : le fichier de l'artefact, rattaché au cours (page HTML unique, ou archive ZIP) ; rien d'autre n'est accepté ;
 * - `entry` : la page d'entrée dans l'archive (chemin relatif sûr) ; « index.html » pour une page seule ;
 * - `display` : « bloc » (hauteur ajustée au contenu) ou « page » (la page HTML du cours, à hauteur d'écran).
 */
export const ARTIFACT_FILE = /^\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const ARTIFACT_DISPLAYS = ["bloc", "page"] as const;
export type ArtifactDisplay = (typeof ARTIFACT_DISPLAYS)[number];
export type ArtifactRef = { fileId: string; entry: string; title: string; display: ArtifactDisplay };

/** Limites de l'envoi : une page collée ou un fichier, une archive. Au-delà, l'artefact a sa place en pièce jointe. */
export const MAX_ARTIFACT_TEXT = 2 * 1024 * 1024;
export const MAX_ARTIFACT_ZIP = 10 * 1024 * 1024;
export const MAX_ARTIFACT_ZIP_ENTRIES = 500;
export const MAX_ARTIFACT_ZIP_EXTRACTED = 40 * 1024 * 1024;
/** Hauteur d'un bloc : celle que la page annonce, bornée. */
export const MIN_HEIGHT = 120;
export const MAX_HEIGHT = 4000;
export const DEFAULT_HEIGHT = 420;

/** Le nom des fichiers d'artefact en base : c'est ce qui les distingue d'une pièce jointe ou d'une image. */
export const ARTIFACT_PAGE_NAME = "artefact.html";
export const ARTIFACT_ZIP_NAME = "artefact.zip";
export const isArtifactFilename = (name: string) => name === ARTIFACT_PAGE_NAME || name === ARTIFACT_ZIP_NAME;

const cleanTitle = (value: unknown) => String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 200);

/** Lit les attributs de la directive (ou les propriétés du bloc) ; null si l'artefact n'est pas un fichier Campuss. */
export function artifactRef(attributes: Record<string, unknown> | null | undefined): ArtifactRef | null {
  const a = attributes ?? {};
  const match = ARTIFACT_FILE.exec(String(a.src ?? ""));
  if (!match) return null;
  const entry = safeRelativePath(String(a.entry || "index.html"));
  if (!entry || !/\.html?$/i.test(entry)) return null;
  return { fileId: match[1], entry, title: cleanTitle(a.title) || "Artefact", display: a.display === "page" ? "page" : "bloc" };
}

export const artifactAttributes = (ref: ArtifactRef) => ({ src: `/files/${ref.fileId}`, entry: ref.entry, title: ref.title, display: ref.display });

export function clampHeight(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, n))) : DEFAULT_HEIGHT;
}

/**
 * Le bac à sable de l'iframe : scripts permis, jamais `allow-same-origin` (origine opaque : ni cookie, ni stockage, ni
 * accès à la page qui l'affiche), ni navigation de la page parente, ni formulaire envoyé.
 */
export const ARTIFACT_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

/**
 * Politique de la page servie par /embed sur l'origine de contenu. Les scripts de l'artefact ne viennent que de la page
 * elle-même et des bibliothèques auto-hébergées (/vendor) ; aucune connexion sortante (connect-src 'none'), aucune
 * image ou police extérieure, pas de formulaire, pas de cadre imbriqué, et seul le site peut l'afficher.
 */
export function artifactCsp({ contentOrigin, baseOrigin }: { contentOrigin: string; baseOrigin: string }) {
  const own = `'self' ${contentOrigin}`;
  return [
    `sandbox ${ARTIFACT_SANDBOX}`,
    "default-src 'none'",
    `script-src ${own} 'unsafe-inline' 'unsafe-eval' blob:`,
    `style-src ${own} 'unsafe-inline'`,
    `img-src ${own} data: blob:`,
    `font-src ${own} data:`,
    `media-src ${own} data: blob:`,
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src blob:",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `frame-ancestors ${baseOrigin}`,
  ].join("; ");
}

/** Message de hauteur envoyé par /vendor/embed-resize.js ; tout autre message est ignoré. */
export function heightFromMessage(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const message = data as { type?: unknown; height?: unknown };
  return message.type === "campuss-height" && typeof message.height === "number" ? clampHeight(message.height) : null;
}
