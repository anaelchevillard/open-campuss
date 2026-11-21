/**
 * Graphique Vega-Lite. La spécification est du JSON, vérifiée avant tout rendu (dans le navigateur
 * comme dans les tests) : aucune donnée ni image chargée depuis une adresse (clé `url` refusée partout), pas de lien
 * (`href`), pas de chargement de configuration extérieure, taille et nombre de lignes bornés. Le rendu se fait ensuite
 * avec l'interpréteur d'expressions de Vega (vega-interpreter, option `ast`) : jamais de code généré ni d'eval().
 *
 * Format du bloc (éditeur et Markdown, bloc de code « vega-lite ») : la spécification JSON, par exemple
 *   { "data": { "values": [{ "a": "A", "b": 28 }] }, "mark": "bar",
 *     "encoding": { "x": { "field": "a", "type": "nominal" }, "y": { "field": "b", "type": "quantitative" } } }
 */
export const MAX_VEGA_CHARS = 200_000;
const MAX_ROWS = 5000;
const MAX_DEPTH = 30;
// Clés qui chargent ou ouvrent quelque chose hors de la spécification
const FORBIDDEN_KEYS = new Set(["url", "href", "$ref", "loader", "usermeta", "__proto__", "constructor", "prototype"]);
const FORBIDDEN_VALUE = /^\s*(javascript:|data:text\/html|https?:\/\/|\/\/)/i;

export type VegaCheck = { ok: true; spec: Record<string, unknown> } | { ok: false; error: string };

export function checkVegaSpec(source: string): VegaCheck {
  if (source.length > MAX_VEGA_CHARS) return { ok: false, error: "Spécification trop longue (200 000 caractères au plus)." };
  let spec: unknown;
  try {
    spec = JSON.parse(source);
  } catch {
    return { ok: false, error: "La spécification doit être du JSON valide." };
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return { ok: false, error: "La spécification doit être un objet JSON." };
  let rows = 0;
  const walk = (value: unknown, depth: number, key: string): string | null => {
    if (depth > MAX_DEPTH) return "Spécification trop imbriquée.";
    if (typeof value === "string") return FORBIDDEN_VALUE.test(value) ? `Adresse refusée (${key || "valeur"}) : les données doivent être dans la spécification.` : null;
    if (Array.isArray(value)) {
      if (key === "values") { rows += value.length; if (rows > MAX_ROWS) return `${MAX_ROWS} lignes de données au plus.`; }
      for (const item of value) { const error = walk(item, depth + 1, key); if (error) return error; }
      return null;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(k)) return k === "url" ? "Les données chargées depuis une adresse ne sont pas acceptées : mets-les dans « values »." : `Clé refusée : « ${k} ».`;
        const error = walk(v, depth + 1, k);
        if (error) return error;
      }
    }
    return null;
  };
  const error = walk(spec, 0, "");
  if (error) return { ok: false, error };
  const out = spec as Record<string, unknown>;
  // Le thème vient de Campuss : pas de schéma à télécharger, pas de fond imposé
  delete out.$schema;
  return { ok: true, spec: out };
}

/** Un résumé lisible pour l'impression et les lecteurs d'écran : le titre ou la description, sinon le type de marque. */
export function vegaSummary(spec: Record<string, unknown>) {
  const title = typeof spec.title === "string" ? spec.title : (spec.title as { text?: unknown } | undefined)?.text;
  if (typeof title === "string" && title.trim()) return title.trim().slice(0, 200);
  if (typeof spec.description === "string" && spec.description.trim()) return spec.description.trim().slice(0, 200);
  const mark = typeof spec.mark === "string" ? spec.mark : (spec.mark as { type?: unknown } | undefined)?.type;
  return typeof mark === "string" ? `Graphique (${mark})` : "Graphique";
}
