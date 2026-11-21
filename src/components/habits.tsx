"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dismissSeasonBanner } from "@/app/actions/habits";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/field";
import { Icon } from "@/components/icon";
import { IconClose } from "@/lib/icons";

export function SeasonBanner({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div role="status" className="rounded-xl bg-card shadow-xs mb-6 flex max-w-3xl items-start gap-3 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm">{text}</p>
      <Button variant="ghost" size="icon" aria-label="Fermer l’annonce de saison" onClick={() => { setOpen(false); void dismissSeasonBanner(); }}><Icon icon={IconClose} className="size-4" /></Button>
    </div>
  );
}

export function CopyLink({ link, label = "Copier le lien" }: { link: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-2">
      <input readOnly aria-label="Lien" value={link} onFocus={(event) => event.target.select()} className={`${selectClass} min-w-0 truncate`} />
      <div><Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard?.writeText(link).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? "Lien copié" : label}</Button></div>
    </div>
  );
}

/** L'horloge de l'appareil peut être fausse : le décompte part de l'heure du serveur, pour que tout le monde voie le même. */
export function GroupTimer({ endsAt, serverNow }: { endsAt: number; serverNow: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(Math.max(0, endsAt - serverNow));
  useEffect(() => {
    const skew = serverNow - Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, endsAt - (Date.now() + skew));
      setLeft(remaining);
      if (remaining === 0) { clearInterval(timer); router.refresh(); }
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt, serverNow, router]);
  const seconds = Math.ceil(left / 1000);
  return <p role="timer" aria-label="Temps restant" className="font-heading text-5xl font-semibold tabular-nums">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</p>;
}

/** Une session lancée par un autre membre doit apparaître sans recharger. */
export function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
