import { cleanHomeWidgets, type HomeWidgetsPref } from "./home-widgets";

/** Préférences d'affichage et de confort, dans users.prefs (compte) ou le cookie campuss-prefs (visiteur). */
export type ReadingFont = "source" | "atkinson" | "serif" | "od";
export type Prefs = {
  theme?: "light" | "dark";                       // absent = système
  textSize?: "s" | "l" | "xl";
  reduceMotion?: boolean;
  readingFont?: ReadingFont;
  readingAll?: boolean; spacing?: "wide" | "wider"; readingWidth?: "narrow"; noItalic?: boolean; paper?: boolean;
  compact?: boolean;
  sounds?: boolean; haptics?: boolean;
  othersStyles?: "plain" | "off";                 // absent = affichés
  hideGame?: boolean;                             // masque flamme, XP, quêtes, ligue
  shortcuts?: false;                              // coupe les raccourcis à une touche
  fixedBars?: boolean;                            // barres basses qui ne se cachent pas
  intent?: "read" | "exam" | "share";
  checklistDismissed?: boolean;
  hints?: string[];                               // astuces déjà vues, 50 au plus
  homeWidgets?: HomeWidgetsPref;                  // widgets de l'accueil (ordinateur) : ordre et masqués
  dyslexic?: boolean; tourDone?: boolean;         // anciennes clés, lues seulement par la migration
};

/** Les réglages du panneau de lecture, enregistrés ensemble par le bouton Enregistrer. */
export const READING_KEYS = ["textSize", "readingFont", "readingAll", "spacing", "readingWidth", "noItalic", "paper", "theme"] as const;
export type ReadingKey = (typeof READING_KEYS)[number];
export const sameReading = (a: Prefs, b: Prefs) => READING_KEYS.every((key) => (a[key] ?? null) === (b[key] ?? null));
/** Toutes les clés, `null` pour « par défaut » : rien ne se perd en route vers le serveur. */
export const readingOf = (prefs: Prefs) => Object.fromEntries(READING_KEYS.map((key) => [key, prefs[key] ?? null])) as Record<ReadingKey, string | boolean | null>;

export const READING_FONTS: { id: ReadingFont; label: string; family: string }[] = [
  { id: "source", label: "Source Sans 3", family: "\"Source Sans 3\"" },
  { id: "atkinson", label: "Atkinson Hyperlegible", family: "\"Atkinson Hyperlegible Next\"" },
  { id: "serif", label: "Source Serif 4", family: "\"Source Serif 4\"" },
  { id: "od", label: "OpenDyslexic", family: "\"OpenDyslexic\"" },
];

const oneOf = <T extends string>(value: unknown, list: readonly T[]): T | undefined => (list as readonly unknown[]).includes(value) ? value as T : undefined;
const flag = (value: unknown) => value === true ? true : undefined;

export function cleanPrefs(raw: unknown): Prefs {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Prefs = {
    theme: oneOf(v.theme, ["light", "dark"] as const),
    textSize: oneOf(v.textSize, ["s", "l", "xl"] as const),
    reduceMotion: flag(v.reduceMotion),
    readingFont: oneOf(v.readingFont, ["source", "atkinson", "serif", "od"] as const),
    readingAll: flag(v.readingAll),
    spacing: oneOf(v.spacing, ["wide", "wider"] as const),
    readingWidth: oneOf(v.readingWidth, ["narrow"] as const),
    noItalic: flag(v.noItalic),
    paper: flag(v.paper),
    compact: flag(v.compact),
    sounds: flag(v.sounds),
    haptics: flag(v.haptics),
    othersStyles: oneOf(v.othersStyles, ["plain", "off"] as const),
    hideGame: flag(v.hideGame),
    shortcuts: v.shortcuts === false ? false : undefined,
    fixedBars: flag(v.fixedBars),
    intent: oneOf(v.intent, ["read", "exam", "share"] as const),
    checklistDismissed: flag(v.checklistDismissed),
    homeWidgets: cleanHomeWidgets(v.homeWidgets),
    hints: Array.isArray(v.hints) ? [...new Set(v.hints.filter((h): h is string => typeof h === "string" && /^[a-z0-9-]{1,40}$/.test(h)))].slice(-50) : undefined,
  };
  // L'ancien mode dyslexie (cookie d'un visiteur) passe aux nouveaux réglages, comme les comptes migrés en base
  if (v.dyslexic === true && !out.readingFont) { out.readingFont = "atkinson"; out.spacing ??= "wide"; }
  if (out.readingFont === "source") delete out.readingFont;
  if (out.hints && !out.hints.length) delete out.hints;
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined)) as Prefs;
}

export function parsePrefs(cookie: string | undefined): Prefs {
  try {
    return cleanPrefs(JSON.parse(cookie ?? "{}"));
  } catch {
    return {};
  }
}

export function prefClasses(prefs: Prefs) {
  const font = prefs.readingFont && prefs.readingFont !== "source" ? `read-${prefs.readingFont}` : "";
  return [
    prefs.theme,
    prefs.textSize ? `text-${prefs.textSize}` : "",
    font,
    // OpenDyslexic ne s'applique jamais à l'interface
    prefs.readingAll && prefs.readingFont !== "od" ? "read-all" : "",
    prefs.spacing ? `spacing-${prefs.spacing}` : "",
    prefs.readingWidth === "narrow" ? "measure-narrow" : "",
    prefs.noItalic ? "no-italic" : "",
    prefs.paper ? "paper-cream" : "",
    prefs.reduceMotion ? "reduce-motion" : "",
    prefs.compact ? "compact" : "",
    prefs.hideGame ? "hide-game" : "",
    prefs.othersStyles ? `others-${prefs.othersStyles}` : "",
    prefs.fixedBars ? "fixed-bars" : "",
    prefs.shortcuts === false ? "no-shortcuts" : "",
  ].filter(Boolean).join(" ");
}

const PREF_CLASS = /^(light|dark|text-(s|l|xl)|read-(atkinson|serif|od|all)|spacing-(wide|wider)|measure-narrow|no-italic|paper-cream|reduce-motion|compact|hide-game|others-(plain|off)|fixed-bars|no-shortcuts)$/;

/** Applique tout de suite les préférences à la page, sans attendre le rechargement. */
export function applyPrefClasses(root: HTMLElement, prefs: Prefs) {
  [...root.classList].filter((name) => PREF_CLASS.test(name)).forEach((name) => root.classList.remove(name));
  prefClasses(prefs).split(" ").filter(Boolean).forEach((name) => root.classList.add(name));
}

/** Relit les réglages d'affichage depuis les classes de la page (un visiteur n'a pas de compte à interroger). */
export function prefsFromClasses(root: HTMLElement): Prefs {
  const has = (name: string) => root.classList.contains(name);
  const pick = <T extends string>(prefix: string, values: readonly T[]) => values.find((v) => has(`${prefix}${v}`));
  return cleanPrefs({
    theme: pick("", ["light", "dark"] as const),
    textSize: pick("text-", ["s", "l", "xl"] as const),
    readingFont: pick("read-", ["atkinson", "serif", "od"] as const),
    readingAll: has("read-all") || undefined,
    spacing: pick("spacing-", ["wide", "wider"] as const),
    readingWidth: has("measure-narrow") ? "narrow" : undefined,
    noItalic: has("no-italic") || undefined,
    paper: has("paper-cream") || undefined,
    reduceMotion: has("reduce-motion") || undefined,
    compact: has("compact") || undefined,
    hideGame: has("hide-game") || undefined,
    othersStyles: pick("others-", ["plain", "off"] as const),
    fixedBars: has("fixed-bars") || undefined,
    shortcuts: has("no-shortcuts") ? false : undefined,
  });
}
