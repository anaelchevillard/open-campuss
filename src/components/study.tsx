"use client";

import { motion, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { saveProgress, toggleFavorite } from "@/app/actions/favorites";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { MARKED_READ } from "@/components/reading/events";
import { IconClose, IconDone, IconDownload, IconFavorite } from "@/lib/icons";

export function FavoriteButton({ docId, initial }: { docId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <Button variant="outline" size="icon" title={on ? "Retirer des favoris" : "Ajouter aux favoris"} aria-label={on ? "En favori" : "Favori"} aria-pressed={on} onClick={async () => setOn(await toggleFavorite(docId))}>
      {on ? <Icon icon={IconFavorite} filled className="pop size-4 text-[var(--link)]" /> : <Icon icon={IconFavorite} className="size-4" />}
    </Button>
  );
}

export function OfflineButton({ path }: { path: string }) {
  const [state, setState] = useState<"idle" | "saved" | "error" | "unsupported">("idle");
  const save = async () => {
    const worker = await navigator.serviceWorker?.ready.catch(() => null);
    if (!worker?.active) return setState("unsupported");
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => setState(event.data?.ok ? "saved" : "error");
    worker.active.postMessage({ type: "save-page", path }, [channel.port2]);
  };
  const label = state === "saved" ? "Disponible hors ligne" : state === "error" ? "Échec, réessayer" : state === "unsupported" ? "Indisponible ici" : "Garder hors ligne";
  return (
    <Button variant="outline" size="icon" title={label} aria-label={label} onClick={() => void save()} disabled={state === "saved"}>
      {state === "saved" ? <Icon icon={IconDone} className="pop size-4 text-[var(--success)]" /> : <Icon icon={IconDownload} className="size-4" />}
    </Button>
  );
}

/** Une fine barre indique où l'on en est dans le cours. */
export function ReadRibbon() {
  const { scrollYProgress } = useScroll();
  return <motion.span aria-hidden="true" style={{ scaleX: scrollYProgress }} className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary" />;
}

/** Reprise de lecture : la position est retenue en pourcentage, écrite au plus toutes les 4 secondes. */
export function ReadingTracker({ docId, initial }: { docId: string; initial: number }) {
  const [offer, setOffer] = useState(initial > 3 && initial < 97);
  const last = useRef(initial);
  // Un cours lu le reste : relire un passage ne le renvoie pas dans « Reprendre »
  const read = useRef(initial >= 97);
  useEffect(() => {
    const onMarked = (event: Event) => { read.current = (event as CustomEvent<boolean>).detail; last.current = read.current ? 100 : 0; };
    addEventListener(MARKED_READ, onMarked);
    return () => removeEventListener(MARKED_READ, onMarked);
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (timer || read.current) return;
      timer = setTimeout(() => {
        timer = undefined;
        const max = document.documentElement.scrollHeight - innerHeight;
        const percent = max > 0 ? Math.round((scrollY / max) * 100) : 100;
        if (read.current) return;
        if (percent >= 97) read.current = true;
        if (Math.abs(percent - last.current) >= 3) { last.current = percent; void saveProgress(docId, percent).catch(() => undefined); }
      }, 4000);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); clearTimeout(timer); };
  }, [docId]);
  if (!offer) return null;
  return (
    <div role="status" className="resume-offer notice-in mb-8 flex flex-wrap items-center gap-3 rounded-xl bg-card py-2 pr-2 pl-4 shadow-xs print:hidden">
      <span className="flex-1">Tu étais à {initial} % de ce cours.</span>
      <Button size="sm"  onClick={() => { scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * (initial / 100), behavior: "smooth" }); setOffer(false); }}>Reprendre</Button>
      <button type="button" aria-label="Fermer" className="press inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setOffer(false)}><Icon icon={IconClose} className="size-4" /></button>
    </div>
  );
}
