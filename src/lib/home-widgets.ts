/** Widgets de l'accueil sur ordinateur (colonne de droite) : ordre et masquage choisis par la personne, dans users.prefs. */
export const HOME_WIDGETS = [
  { id: "exams", label: "Partiels et CC à venir" },
  { id: "likes", label: "Favoris et notes de mes cours" },
  { id: "code", label: "Code ami" },
  { id: "streak", label: "Régularité" },
  { id: "friends", label: "Amis en train de réviser" },
  { id: "ai", label: "Campuss IA" },
] as const;

export type HomeWidgetId = (typeof HOME_WIDGETS)[number]["id"];
export type HomeWidgetsPref = { order: HomeWidgetId[]; hidden: HomeWidgetId[] };

const IDS = HOME_WIDGETS.map((w) => w.id) as HomeWidgetId[];
const isId = (value: unknown): value is HomeWidgetId => (IDS as unknown[]).includes(value);

/** Préférence nettoyée : identifiants connus, sans doublon ; undefined si rien ne s'écarte du réglage par défaut. */
export function cleanHomeWidgets(raw: unknown): HomeWidgetsPref | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const order = [...new Set(Array.isArray(v.order) ? v.order.filter(isId) : [])];
  const hidden = [...new Set(Array.isArray(v.hidden) ? v.hidden.filter(isId) : [])];
  const full = homeWidgetOrder({ order, hidden: [] });
  if (!hidden.length && full.every((id, i) => id === IDS[i])) return undefined;
  return { order: full, hidden };
}

/** L'ordre complet : celui choisi, puis les widgets ajoutés depuis, à leur place par défaut en fin de liste. */
export function homeWidgetOrder(pref: HomeWidgetsPref | undefined): HomeWidgetId[] {
  const chosen = (pref?.order ?? []).filter(isId);
  return [...new Set([...chosen, ...IDS])];
}

export function visibleHomeWidgets(pref: HomeWidgetsPref | undefined): HomeWidgetId[] {
  const hidden = new Set(pref?.hidden ?? []);
  return homeWidgetOrder(pref).filter((id) => !hidden.has(id));
}
