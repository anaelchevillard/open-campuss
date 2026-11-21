"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { declinePublish, publishPack, publishPreview, type PublishPreview } from "@/app/actions/packs";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { IconDone, IconError, IconFriends } from "@/lib/icons";
import { CardText } from "./card-text";

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * « Aide ta promo » : publier un paquet en un geste, au bon moment (fin d'une création, bonne séance,
 * depuis le paquet), avec l'aperçu de ce qui sera public. « Pas pour ce paquet » : l'invitation ne revient plus.
 * Sans `force`, le serveur ne renvoie rien si l'invitation n'a pas lieu d'être : le composant ne montre alors rien.
 */
export function PublishInvite({ scope, force = false, primary = true, className, onDone }: { scope: string; force?: boolean; primary?: boolean; className?: string; onDone?: () => void }) {
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [state, setState] = useState<"idle" | "pending" | "published" | "declined">("idle");
  const [error, setError] = useState("");
  const [packId, setPackId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    publishPreview(scope, force).then((data) => { if (live) setPreview(data); }).catch(() => undefined);
    return () => { live = false; };
  }, [scope, force]);

  if (!preview || state === "declined") return null;
  if (preview.public && state !== "published") {
    return force ? <p className={cn("text-sm text-muted-foreground", className)}>Ce paquet est déjà publié pour ta promo{preview.packId && <> · <Link href={`/reviser/fiches/paquets/${preview.packId}`} className="text-link hover:underline">voir la page publique</Link></>}</p> : null;
  }

  const publish = async () => {
    setState("pending");
    setError("");
    const result = await publishPack(scope).catch(() => ({ error: "Connexion perdue, réessaie." }));
    if ("error" in result) { setError(result.error); setState("idle"); return; }
    setPackId(result.id);
    setState("published");
    onDone?.();
  };
  const decline = async () => {
    setState("declined");
    onDone?.();
    await declinePublish(scope).catch(() => undefined);
  };

  if (state === "published") {
    return (
      <section aria-live="polite" className={cn("flex flex-wrap items-center gap-3 rounded-xl bg-success-tint p-4 text-success-foreground", className)}>
        <Icon icon={IconDone} />
        <p className="min-w-0 flex-1 font-semibold">Publié pour ta promo. Merci !</p>
        {packId && <Link href={`/reviser/fiches/paquets/${packId}`} className="text-sm font-semibold underline-offset-2 hover:underline">Voir la page publique</Link>}
      </section>
    );
  }

  return (
    <section aria-labelledby={`aide-promo-${scope}`} className={cn("grid gap-4 rounded-xl bg-card p-4 text-left shadow-xs ring-1 ring-border/60 md:p-5", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text"><Icon icon={IconFriends} /></span>
        <div className="grid min-w-0 gap-1">
          <h2 id={`aide-promo-${scope}`} className="font-semibold">Aide ta promo</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Publie « {preview.title} » : les étudiants de {preview.program} pourront le réviser et le copier dans leurs fiches.
          </p>
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-semibold">Ce qui sera visible</p>
        <ul className="grid gap-1 text-sm text-muted-foreground">
          <li>Le titre « {preview.title} » et {plural(preview.count, "fiche")}</li>
          <li>Ton nom : {preview.author}</li>
        </ul>
        {preview.sample.length > 0 && (
          <ol className="grid gap-1.5" aria-label="Premières fiches">
            {preview.sample.map((card, index) => (
              <li key={index} className="grid gap-0.5 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <CardText text={card.front} className="font-semibold" clamp />
                <CardText text={card.back} className="text-muted-foreground" clamp />
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">La modération peut retirer un paquet signalé. Tu le retires quand tu veux depuis Mes paquets.</p>
      </div>
      {preview.refusal
        ? <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{preview.refusal}</p>
        : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={primary ? "default" : "outline"} pending={state === "pending"} onClick={() => void publish()}>Publier pour ma promo</Button>
            {!force && <Button variant="ghost" onClick={() => void decline()}>Pas pour ce paquet</Button>}
          </div>
        )}
      {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{error}</p>}
    </section>
  );
}
