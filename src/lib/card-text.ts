/**
 * Texte d'une fiche : Markdown restreint et formules KaTeX entre `$ … $` ou `$$ … $$`.
 * Pas de HTML ; images seulement depuis le site. Logique pure, testée dans tests/fiches-seance.test.ts et fiches-import.test.ts.
 */

/** Une image de fiche ne vient que des fichiers du site (cours ou images de fiches) : jamais d'adresse externe (vie privée, CSP). */
export const CARD_IMAGE = /^\/(files|card-images)\/[0-9a-f-]{36}(\?inline=1)?$/;

/** Les images de fiches citées dans un texte (identifiants, en minuscules). */
export function cardImageIds(text: string) {
  return [...text.matchAll(/\/card-images\/([0-9a-f-]{36})/gi)].map((m) => m[1].toLowerCase());
}

export const cardImageAllowed = (src: unknown): src is string => typeof src === "string" && CARD_IMAGE.test(src);

/** Rien à mettre en forme : le texte s'affiche tel quel, sans passer par le moteur Markdown. */
export function hasMarkup(text: string) {
  return /[*_`$#[\]!>|~]|^\s*(?:[-+]\s|\d+[.)]\s)/m.test(text);
}

/** Un retour à la ligne dans une fiche reste un retour à la ligne (comme avant, en texte brut). */
export function withHardBreaks(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

const SPACE = /\s/;

/** Fin d'une formule `$ … $` ouverte en `from - 1`, à la manière de Pandoc, sinon -1. */
function closingDollar(text: string, from: number) {
  if (from >= text.length || SPACE.test(text[from]) || text[from] === "$") return -1;
  for (let j = from; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") { j++; continue; }
    if (c === "\n" && text[j + 1] === "\n") return -1;
    // Fermeture : pas d'espace juste avant, pas de chiffre juste après (« $5 et $10 » reste du texte)
    if (c === "$" && !SPACE.test(text[j - 1]) && !/\d/.test(text[j + 1] ?? "")) return j;
  }
  return -1;
}

/**
 * Les dollars qui n'ouvrent pas une formule deviennent du texte (`\$`) : « 10 $ », « 5$ et 7$ » ou un `$` isolé
 * ne cassent rien. Une formule simple suit la règle de Pandoc : `$x$` sans espace contre les dollars.
 */
export function protectDollars(text: string) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") { out += text.slice(i, i + 2); i++; continue; }
    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > 0) { out += text.slice(i, end + 1); i = end; continue; }
    }
    if (c !== "$") { out += c; continue; }
    if (text[i + 1] === "$") {
      const end = text.indexOf("$$", i + 2);
      if (end >= 0) { out += text.slice(i, end + 2); i = end + 1; continue; }
      out += "\\$\\$"; i++; continue;
    }
    const close = closingDollar(text, i + 1);
    if (close > 0) { out += text.slice(i, close + 1); i = close; continue; }
    out += "\\$";
  }
  return out;
}
