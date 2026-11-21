import type { MemoryStats } from "@/lib/memo-stats";

const DAY_NAMES = (now: Date, days: number) =>
  Array.from({ length: days }, (_, i) => (i === 0 ? "Auj." : i === 1 ? "Dem." : new Date(now.getTime() + i * 86_400_000).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")));

/** Mémoire : quelques chiffres et la prévision des 7 prochains jours. */
export function MemoryPanel({ stats, now = new Date() }: { stats: MemoryStats; now?: Date }) {
  const peak = Math.max(1, ...stats.forecast);
  const names = DAY_NAMES(now, stats.forecast.length);
  const figures = [
    { label: "à revoir", value: String(stats.due) },
    { label: stats.fresh > 1 ? "nouvelles" : "nouvelle", value: String(stats.fresh) },
    { label: stats.mature > 1 ? "acquises (21 j et plus)" : "acquise (21 j et plus)", value: String(stats.mature) },
    { label: stats.reviews ? `retenues sur 30 jours (${stats.reviews} ${stats.reviews > 1 ? "notes" : "note"})` : "retenues sur 30 jours", value: stats.retention === null ? "—" : `${stats.retention} %` },
  ];
  return (
    <section aria-labelledby="memory-title" className="grid gap-5 rounded-xl bg-card p-5 shadow-xs md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:gap-8">
      <div className="grid content-start gap-3">
        <h2 id="memory-title" className="heading">Ma mémoire</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
          {figures.map((f) => (
            <div key={f.label} className="grid content-start">
              <dt className="order-2 text-sm text-pretty text-muted-foreground">{f.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
        {stats.learning + stats.young > 0 && <p className="text-sm text-muted-foreground">{stats.learning} en apprentissage · {stats.young} en cours de consolidation{stats.suspended ? ` · ${stats.suspended} de côté` : ""}</p>}
      </div>
      <figure className="grid content-start gap-2">
        <figcaption className="text-sm font-semibold">À revoir ces 7 jours</figcaption>
        <ol className="grid h-28 grid-cols-7 items-end gap-1.5" aria-label="Fiches à revoir par jour">
          {stats.forecast.map((n, i) => (
            <li key={names[i]} className="grid h-full grid-rows-[auto_1fr_auto] items-end justify-items-center gap-1 text-xs" title={`${names[i]} : ${n}`}>
              <span className="tabular-nums text-muted-foreground">{n || ""}</span>
              <span aria-hidden className="w-full rounded-t-md bg-primary/80 motion-ok:animate-[grow-y_500ms_var(--ease-out)_both] origin-bottom" style={{ height: `${Math.max(n ? 6 : 2, (n / peak) * 100)}%`, opacity: n ? 1 : 0.25 }} />
              <span className="text-muted-foreground"><span className="sr-only">{n} le </span>{names[i]}</span>
            </li>
          ))}
        </ol>
      </figure>
    </section>
  );
}
