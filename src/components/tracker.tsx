"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { IconInfo } from "@/lib/icons";

const track = (body: Record<string, unknown>) =>
  void fetch("/api/track", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);

/** Recherche sans résultat : le serveur ne la garde qu'avec l'accord à la mesure d'audience, en total du jour. */
export const reportSearchMiss = (query: string) => track({ kind: "miss", query });

export function SearchMiss({ query }: { query: string }) {
  useEffect(() => { reportSearchMiss(query); }, [query]);
  return null;
}

type Visible = { path: string | null; since: number; total: number; sent: boolean };

export function Tracker() {
  const pathname = usePathname();
  useEffect(() => { void navigator.serviceWorker?.register("/sw.js").catch(() => undefined); }, []);
  const previous = useRef<string | null>(null);
  // Temps passé au premier plan sur la page : envoyé en quittant la page ou l'onglet, gardé seulement avec accord
  const visible = useRef<Visible>({ path: null, since: 0, total: 0, sent: false });
  const flush = useCallback(() => {
    const v = visible.current;
    if (!v.path) return;
    if (v.since) v.total += Date.now() - v.since;
    v.since = document.visibilityState === "visible" ? Date.now() : 0;
    const seconds = Math.round(v.total / 1000);
    if (seconds < 1) return;
    track({ kind: "time", path: v.path, seconds, more: v.sent });
    v.sent = true;
    v.total = 0;
  }, []);
  useEffect(() => {
    if (previous.current === pathname) return;
    const referrer = previous.current === null ? document.referrer : "";
    previous.current = pathname;
    flush();
    visible.current = { path: pathname, since: document.visibilityState === "visible" ? Date.now() : 0, total: 0, sent: false };
    track({ path: pathname, referrer });
  }, [pathname, flush]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else visible.current.since = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVisibility); removeEventListener("pagehide", flush); };
  }, [flush]);
  return null;
}

const CHOICE_KEY = "campuss-consent";

/**
 * Consentement à la mesure d'audience (RGPD) : refuser est aussi visible qu'accepter, rien n'est posé sans choix.
 * D'abord une bande compacte EN TÊTE de page, dans le flux : elle pousse le contenu au lieu de le recouvrir et ne cache
 * aucune action. Rouverte par « Gérer les cookies », elle s'affiche en bas, compacte. Le choix est gardé (cookie
 * côté serveur et, en secours, sur cet appareil) : la bande ne revient plus.
 */
export function ConsentBanner({ decided }: { decided: boolean }) {
  const [open, setOpen] = useState(!decided);
  const [reopened, setReopened] = useState(false);
  useEffect(() => {
    const show = () => { setReopened(true); setOpen(true); };
    window.addEventListener("campuss-consent-open", show);
    return () => window.removeEventListener("campuss-consent-open", show);
  }, []);
  useEffect(() => {
    if (decided) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(CHOICE_KEY); } catch { /* stockage bloqué : la bande reste */ }
    if (saved !== "yes" && saved !== "no") return;
    setOpen(false); // eslint-disable-line react-hooks/set-state-in-effect -- choix déjà fait sur cet appareil, cookie perdu
    void fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice: saved }) }).catch(() => undefined);
  }, [decided]);
  const choose = async (choice: "yes" | "no") => {
    setOpen(false);
    try { localStorage.setItem(CHOICE_KEY, choice); } catch { /* le cookie du serveur suffit */ }
    await fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }) }).catch(() => undefined);
  };
  const content = (
    <>
      <p className="flex min-w-0 flex-1 items-start gap-2 text-sm leading-snug"><Icon icon={IconInfo} size={16} className="mt-0.5 shrink-0 text-muted-foreground" /><span>Mesure d’audience interne, liée à ton compte si tu l’acceptes. Rien n’est vendu ni partagé. <Link className="text-[var(--link)] underline underline-offset-2" href="/confidentialite#cookies">En savoir plus</Link></span></p>
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
        <Button variant="outline" size="sm" onClick={() => void choose("no")}>Refuser</Button>
        <Button variant="outline" size="sm" onClick={() => void choose("yes")}>Accepter</Button>
      </div>
    </>
  );
  if (open && !reopened) return (
    <section aria-label="Choix pour les cookies de mesure" className="consent-strip border-b border-border bg-popover text-popover-foreground print:hidden">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:gap-4">{content}</div>
    </section>
  );
  return (
    <AnimatePresence>
      {open && (
        <motion.section
          aria-label="Choix pour les cookies de mesure"
          initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
          className="fixed inset-x-3 bottom-safe z-(--z-overlay) mx-auto flex max-w-2xl flex-col gap-2 rounded-xl bg-popover p-3 text-popover-foreground shadow-lg sm:flex-row sm:items-center sm:gap-4 print:hidden"
        >
          {content}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

export function ConsentLink() {
  return <button type="button" className="press py-1 text-left hover:text-foreground" onClick={() => window.dispatchEvent(new Event("campuss-consent-open"))}>Gérer les cookies</button>;
}
