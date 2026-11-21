"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { installGuide, shouldOfferInstall, type InstallGuide } from "@/lib/install-hint";

const VISITS = "campuss-visits";
const SHOWN = "campuss-install-shown";
const SHOWING = "campuss-install-showing";
const COUNTED = "campuss-visit-counted";

type PromptEvent = Event & { prompt: () => Promise<void> };

// Navigation privée, stockage bloqué : la proposition n'apparaît pas, le reste du site n'en souffre pas
const safely = <T,>(read: () => T, fallback: T) => { try { return read(); } catch { return fallback; } };

function countVisit() {
  return safely(() => {
    let visits = Number(localStorage.getItem(VISITS)) || 0;
    if (!sessionStorage.getItem(COUNTED)) {
      sessionStorage.setItem(COUNTED, "1");
      visits += 1;
      localStorage.setItem(VISITS, String(visits));
    }
    return { visits, shown: Boolean(localStorage.getItem(SHOWN)), showingNow: Boolean(sessionStorage.getItem(SHOWING)) };
  }, null);
}

export function InstallHint() {
  const [guide, setGuide] = useState<InstallGuide>(null);
  const prompt = useRef<PromptEvent | null>(null);
  useEffect(() => {
    const memory = countVisit();
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!memory || !shouldOfferInstall(memory, standalone)) return;
    const show = (hasPrompt: boolean) => {
      const found = installGuide({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, hasPrompt });
      if (!found) return;
      safely(() => { localStorage.setItem(SHOWN, "1"); sessionStorage.setItem(SHOWING, "1"); }, undefined);
      setGuide(found);
    };
    const onPrompt = (event: Event) => { event.preventDefault(); prompt.current = event as PromptEvent; show(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // Attendre l'événement, puis se rabattre sur le mode d'emploi : hors de ce cas il ne viendra jamais
    const timer = setTimeout(() => { if (!prompt.current) show(false); }, 3000);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); clearTimeout(timer); };
  }, []);
  if (!guide) return null;
  const close = () => { safely(() => sessionStorage.removeItem(SHOWING), undefined); setGuide(null); };
  return (
    <aside aria-label="Ajouter à l’écran d’accueil" className="rounded-xl bg-card shadow-xs fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 p-4 shadow-lg md:inset-x-auto md:bottom-4 md:right-4 md:w-80">
      <p className="font-semibold">Garde Campuss sur ton écran d’accueil</p>
      {guide === "ios" && <p className="mt-1 text-sm text-muted-foreground">Dans Safari, touche Partager, puis Sur l’écran d’accueil. Sur iPhone, c’est la seule façon de recevoir les notifications.</p>}
      {guide === "android" && <p className="mt-1 text-sm text-muted-foreground">Ouvre le menu du navigateur, puis Ajouter à l’écran d’accueil.</p>}
      {guide === "prompt" && <p className="mt-1 text-sm text-muted-foreground">Il s’ouvre comme une application, en un geste.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={close}>Fermer</Button>
        {guide === "prompt" && <Button size="sm" onClick={() => { void prompt.current?.prompt(); close(); }}>Installer</Button>}
      </div>
    </aside>
  );
}
