// Calculs purs des statistiques d'administration : périodes, comparaisons, rétention, entonnoir.
// Aucun accès à la base ici : les requêtes (lib/audience-queries.ts) ne renvoient que des totaux.

const DAY = 86_400_000;

export const PERIODS = [7, 30, 90, 365] as const;
export type PeriodDays = (typeof PERIODS)[number];

/** Une fenêtre en jours de Paris, bornes comprises (AAAA-MM-JJ). */
export type Window = { from: string; to: string };
export type Period = { days: PeriodDays; current: Window; previous: Window };

/** Jour de Paris d'un instant, au format AAAA-MM-JJ. */
export function parisDay(date: Date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Décale un jour AAAA-MM-JJ de n jours (calendrier, sans fuseau). */
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}

export function dayRange({ from, to }: Window) {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 1000; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Période choisie (7, 30, 90 ou 365 jours, aujourd'hui compris) et la période précédente de même longueur. */
/**
 * Actifs du jour, des 7 et des 30 derniers jours, pour chaque jour de `days` (jours consécutifs). `byDay` donne, pour
 * chaque jour, les personnes actives ce jour-là (numéros anonymes, sans doublon), y compris les 29 jours avant le
 * premier. Fenêtres glissantes : chaque jour n'est ajouté et retiré qu'une fois.
 */
export function rollingActive(byDay: ReadonlyMap<string, readonly number[]>, days: readonly string[]) {
  const slide = (width: number) => {
    const counts = new Map<number, number>();
    const out: number[] = [];
    const move = (day: string, delta: 1 | -1) => {
      for (const k of byDay.get(day) ?? []) {
        const n = (counts.get(k) ?? 0) + delta;
        if (n > 0) counts.set(k, n);
        else counts.delete(k);
      }
    };
    if (!days.length) return out;
    for (let i = width - 1; i >= 1; i--) move(addDays(days[0], -i), 1);
    for (const day of days) {
      move(day, 1);
      out.push(counts.size);
      move(addDays(day, -(width - 1)), -1);
    }
    return out;
  };
  const wau = slide(7), mau = slide(30);
  return days.map((day, i) => ({ day, dau: byDay.get(day)?.length ?? 0, wau: wau[i], mau: mau[i] }));
}

export function periodOf(raw: unknown, now = new Date()): Period {
  const days = (PERIODS as readonly number[]).includes(Number(raw)) ? (Number(raw) as PeriodDays) : 30;
  const to = parisDay(now);
  const from = addDays(to, -(days - 1));
  return { days, current: { from, to }, previous: { from: addDays(from, -days), to: addDays(from, -1) } };
}

export type Trend = "up" | "down" | "flat" | "new" | null;
export type Comparison = { current: number | null; previous: number | null; delta: number | null; ratio: number | null; trend: Trend };

/**
 * Comparaison à la période précédente. `ratio` est la variation relative (0,25 = +25 %), nulle quand la période
 * précédente vaut 0 : on dit alors « nouveau » plutôt qu'un pourcentage infini.
 */
export function compare(current: number | null, previous: number | null): Comparison {
  if (current === null || previous === null) return { current, previous, delta: null, ratio: null, trend: null };
  const delta = current - previous;
  if (previous === 0) return { current, previous, delta, ratio: null, trend: current === 0 ? "flat" : "new" };
  const ratio = delta / previous;
  return { current, previous, delta, ratio, trend: Math.abs(ratio) < 0.005 ? "flat" : ratio > 0 ? "up" : "down" };
}

/** « +25 % », « −3 % », « nouveau », « = » : ce qu'affiche la pastille d'évolution. */
export function trendLabel(c: Comparison) {
  if (c.trend === null) return null;
  if (c.trend === "new") return "nouveau";
  if (c.trend === "flat") return "=";
  const pct = Math.round((c.ratio ?? 0) * 100);
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`;
}

export type SeriesPoint = { day: string; current: number; previous: number | null };

/**
 * Aligne la période et la précédente jour par jour : le point i de la courbe montre le jour i de chacune.
 * Les jours sans ligne valent 0 (le temps passe aussi quand il ne se passe rien).
 */
export function alignSeries(rows: { day: string; n: number }[], period: Period): SeriesPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));
  const previous = dayRange(period.previous);
  return dayRange(period.current).map((day, i) => ({ day, current: byDay.get(day) ?? 0, previous: previous[i] ? byDay.get(previous[i]) ?? 0 : null }));
}

/** Regroupe une série quotidienne par paquets de `size` jours (semaines sur 90 jours et plus), en partant de la fin. */
export function bucketSeries(points: SeriesPoint[], size: number, mode: "sum" | "last" | "mean" = "sum"): SeriesPoint[] {
  if (size <= 1) return points;
  const fold = (values: number[]) => {
    const sum = values.reduce((a, v) => a + v, 0);
    return mode === "last" ? values.at(-1)! : mode === "mean" ? Math.round(sum / values.length) : sum;
  };
  const out: SeriesPoint[] = [];
  for (let end = points.length; end > 0; end -= size) {
    const chunk = points.slice(Math.max(0, end - size), end);
    const prev = chunk.map((p) => p.previous);
    out.unshift({
      day: chunk[0].day,
      current: fold(chunk.map((p) => p.current)),
      previous: prev.some((p) => p === null) ? null : fold(prev as number[]),
    });
  }
  return out;
}

export const bucketSize = (days: number) => (days >= 90 ? 7 : 1);

export const sumOf = (points: SeriesPoint[], key: "current" | "previous") => points.reduce((a, p) => a + (p[key] ?? 0), 0);
export const meanOf = (points: SeriesPoint[], key: "current" | "previous") => (points.length ? sumOf(points, key) / points.length : 0);

// --- Rétention par cohorte

export const RETENTION_DAYS = [1, 7, 30] as const;
export type CohortRow = { cohort: string; signed: number; d1: number; d7: number; d30: number };
export type RetentionCell = { k: number; n: number; rate: number | null };
export type RetentionLine = { cohort: string; signed: number; cells: RetentionCell[] };

/**
 * Une cohorte = les inscrits d'une semaine (ou d'un mois) ; « revenu à J+k » = au moins une activité k jours ou plus
 * après l'inscription. Tant que le dernier inscrit de la cohorte n'a pas eu k jours, la case reste vide (null) :
 * un taux mesuré trop tôt serait faussement bas.
 */
export function retentionTable(rows: CohortRow[], today: string, unit: "week" | "month" = "week"): { lines: RetentionLine[]; average: RetentionCell[] } {
  const lastDay = (cohort: string) => (unit === "week" ? addDays(cohort, 6) : addDays(addMonth(cohort), -1));
  const lines = rows.map((row) => ({
    cohort: row.cohort, signed: row.signed,
    cells: RETENTION_DAYS.map((k) => {
      const n = row[`d${k}` as "d1" | "d7" | "d30"];
      const mature = addDays(lastDay(row.cohort), k) <= today;
      return { k, n, rate: mature && row.signed > 0 ? n / row.signed : null };
    }),
  }));
  return { lines, average: weightedAverage(lines, [...RETENTION_DAYS]) };
}

/** Moyenne pondérée par la taille des cohortes, sur les seules cohortes mûres. */
function weightedAverage(lines: RetentionLine[], ks: number[]): RetentionCell[] {
  return ks.map((k, i) => {
    const ready = lines.filter((l) => l.cells[i].rate !== null);
    const signed = ready.reduce((a, l) => a + l.signed, 0);
    const n = ready.reduce((a, l) => a + l.cells[i].n, 0);
    return { k, n, rate: signed ? n / signed : null };
  });
}

export const RETENTION_WEEKS = 8;
/** `weeks[w - 1]` : personnes de la cohorte actives pendant la semaine w après leur début (jours 7w à 7w + 6). */
export type WeeklyCohortRow = { cohort: string; signed: number; weeks: number[] };

/**
 * Courbe de rétention par semaine : part de chaque cohorte hebdomadaire active la semaine 1, 2…
 * après son début. Même règle de maturité que `retentionTable` : la case reste vide tant que le dernier arrivé de
 * la cohorte n'a pas fini cette semaine-là.
 */
export function weeklyRetention(rows: WeeklyCohortRow[], today: string, weeks = RETENTION_WEEKS): { lines: RetentionLine[]; average: RetentionCell[] } {
  const ks = Array.from({ length: weeks }, (_, i) => i + 1);
  const lines = rows.map((row) => ({
    cohort: row.cohort, signed: row.signed,
    cells: ks.map((w) => {
      const n = row.weeks[w - 1] ?? 0;
      const mature = addDays(addDays(row.cohort, 6), 7 * w + 6) <= today;
      return { k: w, n, rate: mature && row.signed > 0 ? n / row.signed : null };
    }),
  }));
  return { lines, average: weightedAverage(lines, ks) };
}

function addMonth(day: string) {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

// --- Entonnoir

export type FunnelStep = { id: string; label: string; n: number; medianSeconds?: number | null };
export type FunnelView = FunnelStep & { ofFirst: number | null; ofPrevious: number | null; lost: number };

/** Chaque étape en part du départ et de l'étape précédente, avec le nombre perdu en route. */
export function funnelView(steps: FunnelStep[]): FunnelView[] {
  const first = steps[0]?.n ?? 0;
  return steps.map((step, i) => {
    const before = i === 0 ? null : steps[i - 1].n;
    return {
      ...step,
      ofFirst: first ? step.n / first : null,
      ofPrevious: before === null ? null : before ? step.n / before : null,
      lost: before === null ? 0 : Math.max(0, before - step.n),
    };
  });
}

// --- Données collectées (avec accord seulement)

/** Durée d'une vue envoyée par le navigateur : entière, de 1 s à 30 min ; au-delà, l'onglet est resté ouvert. */
export const MAX_VIEW_SECONDS = 1800;
export function viewSeconds(raw: unknown) {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_VIEW_SECONDS) : null;
}

/**
 * Recherche sans résultat, réduite à ce qui sert à écrire les cours manquants : minuscules, sans accents ni
 * ponctuation, 60 caractères. Ce qui ressemble à une adresse, un lien ou un numéro (5 chiffres de suite) n'est pas gardé.
 */
export function missQuery(raw: unknown) {
  if (typeof raw !== "string") return null;
  if (/@|https?:|www\.|\d{5}/i.test(raw)) return null;
  const q = raw.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return q.length >= 3 ? q : null;
}

/** Une recherche n'apparaît dans les statistiques qu'à partir de ce nombre : une requête isolée reste invisible. */
export const MISS_THRESHOLD = 2;

// --- Filtres croisés

export type StatsFilters = { programId: number | null; level: number | null; subjectId: number | null };

const positive = (raw: unknown, max = 2_147_483_647) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
};

/** Licence, année (L1 à L3) et matière, lus dans l'URL ; une valeur invalide est ignorée. */
export function filtersOf(params: Record<string, unknown>, fallbackProgram: number | null = null): StatsFilters {
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const licence = one(params.licence);
  return {
    programId: licence === "toutes" ? null : positive(licence) ?? fallbackProgram,
    level: positive(one(params.annee), 3),
    subjectId: positive(one(params.matiere)),
  };
}

/** Lien vers une vue des statistiques en gardant période et filtres : le détail d'un chiffre. */
export function statsHref(params: Record<string, string | undefined>, patch: Record<string, string | number | null>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) next.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") next.delete(k);
    else next.set(k, String(v));
  }
  const query = next.toString();
  return `/admin/statistiques${query ? `?${query}` : ""}`;
}

/** Durée lisible : « 45 s », « 2 min 30 s », « 1 h 05 ». */
export function formatSeconds(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const rest = s % 60;
    return rest ? `${Math.floor(s / 60)} min ${rest} s` : `${s / 60} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export const percent = (rate: number | null, digits = 0) => (rate === null ? "—" : `${(rate * 100).toFixed(digits).replace(".", ",")} %`);
