import Link from "next/link";
import { Icon } from "@/components/icon";
import { Stat } from "@/components/stat";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { buttonVariants } from "@/components/ui/button";
import { IconToFix } from "@/lib/icons";
import { formatRating, trend, type MyDoc } from "@/lib/my-documents";
import { reasonLabel } from "@/lib/review-reasons";
import type { AuthorStats } from "@/lib/site-stats";

/** « À corriger » en tête : une alerte par cours renvoyé, motif et relecteur cités. Seul élément de la page qui ressort. */
export function ToFixAlerts({ docs }: { docs: MyDoc[] }) {
  const toFix = docs.filter((d) => d.status === "tofix");
  if (!toFix.length) return null;
  return (
    <ul className="stagger grid gap-2" aria-label="À corriger">
      {toFix.map((doc) => {
        const reason = reasonLabel(doc.reasonCode);
        return (
          <li key={doc.id}>
            <Alert variant="warning" className="bg-warning-tint px-4 py-3">
              <Icon icon={IconToFix} size={20} className="text-warning" />
              <AlertTitle className="line-clamp-2 text-base text-foreground">À corriger · {doc.title.trim() || "Sans titre"}</AlertTitle>
              <AlertDescription className="text-warning-foreground">
                <p className="text-pretty">{reason && doc.reviewNote?.startsWith(reason) ? doc.reviewNote : [reason, doc.reviewNote].filter(Boolean).join(" : ")}{doc.reviewer && <span className="text-muted-foreground"> · {doc.reviewer}</span>}</p>
              </AlertDescription>
              <AlertAction><Link href={`/editer/${doc.id}`} data-slot="button" className={buttonVariants({ variant: "outline", size: "sm" })}>Corriger</Link></AlertAction>
            </Alert>
          </li>
        );
      })}
    </ul>
  );
}

/** Les quatre chiffres de l'auteur. Pas de chiffres qui défilent : c'est un écran de travail. */
export function AuthorStatsRow({ stats }: { stats: AuthorStats }) {
  const change = trend(stats.readersWeek, stats.readersPrevWeek);
  return (
    <section aria-label="Tes chiffres" className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl bg-card p-4 shadow-xs md:grid-cols-4 md:p-6">
      <Stat value={stats.readersWeek.toLocaleString("fr-FR")} label="lecteurs cette semaine"
        hint={change === null ? undefined : <span className={change >= 0 ? "text-success-foreground" : undefined}>{change >= 0 ? "+" : "−"}{Math.abs(change)} % sur 7 jours</span>} />
      <Stat value={stats.ratingAvg === null ? "–" : formatRating(stats.ratingAvg)} label="note moyenne" hint={stats.ratingCount ? `${stats.ratingCount} note${stats.ratingCount > 1 ? "s" : ""}` : undefined} />
      <Stat value={stats.published} label={stats.published > 1 ? "publications" : "publication"} hint={stats.published ? stats.publishedLabel : undefined} />
      <Stat value={`+${stats.creditsMonth}`} label="crédits ce mois" />
    </section>
  );
}
