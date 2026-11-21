import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setErrorStatus } from "@/app/actions/admin/errors";
import type { Share } from "@/lib/errors/queries";

type Status = "open" | "resolved" | "ignored";

export function ErrorStatusBadge({ status, regressed }: { status: Status; regressed?: boolean }) {
  if (status === "resolved") return <Badge variant="secondary">Résolue</Badge>;
  if (status === "ignored") return <Badge variant="outline">Ignorée</Badge>;
  return <Badge variant="destructive">{regressed ? "Revenue" : "Ouverte"}</Badge>;
}

/** « Chrome 12 · Safari 3 » */
export const sharesText = (shares: Share[]) => shares.map((s) => `${s.label} ${s.n.toLocaleString("fr-FR")}`).join(" · ");

/** Résoudre, ignorer ou rouvrir : formulaires simples, l'action vérifie l'accès administrateur. */
export function ErrorStatusActions({ id, status }: { id: number; status: Status }) {
  const next: [Status, string, "default" | "outline"][] = status === "open"
    ? [["resolved", "Marquer résolue", "default"], ["ignored", "Ignorer", "outline"]]
    : [["open", "Rouvrir", "outline"]];
  return (
    <div className="flex flex-wrap gap-2">
      {next.map(([value, label, variant]) => (
        <form key={value} action={setErrorStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={value} />
          <Button type="submit" variant={variant}>{label}</Button>
        </form>
      ))}
    </div>
  );
}
