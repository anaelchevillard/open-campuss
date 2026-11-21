import type { ActivityLayer } from "@/lib/profile-data";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const MONTHS = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const MONTH_LONG = new Intl.DateTimeFormat("fr-FR", { month: "long" });
const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const key = (date: Date) => date.toISOString().slice(0, 10);

type Scale = (n: number) => 0 | 1 | 2 | 3 | 4;
export const contributionScale: Scale = (n) => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);
export const studyScale: Scale = (n) => (n <= 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4);

/** Résumé lisible : « 87 jours actifs cette année, le plus en mars ». */
export function activitySummary(layer: ActivityLayer, noun: string) {
  const months = new Map<string, number>();
  for (const [day, n] of layer) months.set(day.slice(0, 7), (months.get(day.slice(0, 7)) ?? 0) + n);
  const best = [...months].sort((a, b) => b[1] - a[1])[0];
  if (!layer.size) return `Aucun jour ${noun} sur un an`;
  return `${layer.size} jour${layer.size > 1 ? "s" : ""} ${noun}${layer.size > 1 ? "s" : ""} sur un an${best ? `, le plus en ${MONTH_LONG.format(new Date(`${best[0]}-15`))}` : ""}`;
}

/** Nombres de semaines proposés, du plus large au plus étroit : le panneau affiche le plus grand qui tient (requête de conteneur). */
const SPANS = [53, 40, 27, 20] as const;
const LABEL_WIDTH = 22;

function grid(weeks: number, today: Date, layer: ActivityLayer) {
  const weekday = (today.getUTCDay() + 6) % 7; // lundi = 0
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - weekday - (weeks - 1) * 7);
  const cells: { x: number; y: number; day: string; n: number }[] = [];
  const months: { x: number; label: string }[] = [];
  const width = weeks * STEP - GAP;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + w * 7 + d);
      if (date > today) continue;
      if (date.getUTCDate() === 1 || (w === 0 && d === 0)) months.push({ x: w * STEP, label: MONTHS.format(date).replace(".", "") });
      cells.push({ x: w * STEP, y: d * STEP + 16, day: key(date), n: layer.get(key(date)) ?? 0 });
    }
  }
  // Un mois n'est nommé que s'il a la place entière : ni chevauchement avec le précédent, ni coupure au bord droit
  const labels = months.filter((m, i) => (i === 0 || m.x - months[i - 1].x >= STEP * 3) && m.x + LABEL_WIDTH <= width);
  return { cells, labels, width, height: 7 * STEP - GAP + 16 };
}

/**
 * Carte de chaleur dessinée côté serveur (aucun script). Plus de défilement horizontal (il coupait le premier mois,
 * « évr ») : quatre longueurs (53, 40, 27, 20 semaines) et le panneau affiche la plus longue qui tient, à pleine largeur,
 * toujours terminée par la semaine en cours.
 */
export function ActivityGraph({ layer, scale, label, unit, now = new Date() }: { layer: ActivityLayer; scale: Scale; label: string; unit: [string, string]; now?: Date }) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return (
    <div className="grid gap-2">
      <div className="activity-fit">
        {SPANS.map((weeks) => {
          const { cells, labels, width, height } = grid(weeks, today, layer);
          return (
            <svg key={weeks} data-weeks={weeks} role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} className="activity">
              {labels.map((m) => <text key={m.x} x={m.x} y={10} className="fill-muted-foreground text-[10px]">{m.label}</text>)}
              {cells.map((c) => (
                <rect key={c.day} x={c.x} y={c.y} width={CELL} height={CELL} rx={2.5} className={`a${scale(c.n)}`}>
                  <title>{`${c.n} ${c.n > 1 ? unit[1] : unit[0]} · ${DAY.format(new Date(c.day))}`}</title>
                </rect>
              ))}
            </svg>
          );
        })}
      </div>
      <div aria-hidden className="activity activity-legend flex items-center justify-end gap-1 text-xs text-muted-foreground">
        Moins {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`a${l} size-2.5 rounded-[2px]`} />)} Plus
      </div>
    </div>
  );
}
