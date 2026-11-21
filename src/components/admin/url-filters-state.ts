import type { FilterQuery, FilterRule } from "@/components/reui/filters/filters-types";

type Value = string | string[];
type Query = FilterQuery<Value>;
type Rule = FilterRule<Value>;

/** Les critères écrits dans l'URL, sous forme de règles ReUI (un paramètre = une règle). */
export function rulesFromParams(ids: string[], get: (id: string) => string | null): Rule[] {
  return ids.filter((id) => get(id)).map((id) => {
    const values = get(id)!.split(",");
    return { id: `r-${id}`, type: "rule", path: [id], operator: values.length > 1 ? "is_any_of" : "is", value: values.length > 1 ? values : values[0] };
  });
}

const hasValue = (rule: Rule) => (Array.isArray(rule.value) ? rule.value.length > 0 : rule.value !== undefined && rule.value !== "");

/**
 * Sépare une requête ReUI en ce qui va dans l'URL (règles complètes) et ce qui reste à l'écran (règles en cours :
 * un critère choisi, sans valeur encore). Avant, ces règles en cours étaient jetées : la requête affichée venant de
 * l'URL, le critère disparaissait à peine choisi et aucun filtre ne pouvait être posé.
 */
export function splitQuery(ids: string[], next: Query): { patch: Record<string, string | null>; drafts: Rule[]; rules: Rule[] } {
  const patch: Record<string, string | null> = Object.fromEntries(ids.map((id) => [id, null]));
  const drafts: Rule[] = [];
  const rules: Rule[] = [];
  for (const node of next.rules) {
    if (node.type !== "rule") continue;
    const key = node.path[0];
    if (!key || !ids.includes(key)) continue;
    rules.push(node);
    if (!hasValue(node)) { drafts.push(node); continue; }
    patch[key] = Array.isArray(node.value) ? node.value.join(",") : String(node.value);
  }
  return { patch, drafts, rules };
}

/**
 * La requête affichée. `local` est la dernière requête reçue du composant, `fresh` dit si l'URL n'a pas encore bougé
 * depuis : on la montre telle quelle (pas de critère qui clignote le temps de la navigation). Ensuite l'URL fait foi,
 * plus les règles en cours dont le critère n'y est pas déjà.
 */
export function mergeQuery(fromUrl: Rule[], local: Rule[], fresh = false): Query {
  if (fresh) return { id: "root", type: "group", combinator: "and", rules: local };
  const taken = new Set(fromUrl.map((r) => r.path[0]));
  const drafts = local.filter((d) => !hasValue(d) && !taken.has(d.path[0]));
  return { id: "root", type: "group", combinator: "and", rules: [...fromUrl, ...drafts] };
}
