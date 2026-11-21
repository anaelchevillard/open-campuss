"use client";

import { motion } from "motion/react";
import { Attest } from "@/components/attest";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { attestDownload, toggleThanks } from "@/app/actions/reading";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { IconThanks } from "@/lib/icons";

/** « Merci » : un contour qui se remplit, une gerbe de points au premier clic. Jamais un second bouton plein. */
export function ThanksButton({ docId, thanked, count }: { docId: string; thanked: boolean; count: number }) {
  const router = useRouter();
  const [state, setState] = useState({ thanked, count, burst: 0, error: "" });
  const [pending, start] = useTransition();
  const thank = () => start(async () => {
    const result = await toggleThanks(docId);
    setState((s) => ("error" in result ? { ...s, error: result.error } : { ...s, thanked: result.thanked, count: result.count, burst: s.burst + (result.thanked ? 1 : 0), error: "" }));
    router.refresh();
  });
  return (
    <>
      <Button variant="outline" disabled={pending} aria-pressed={state.thanked} onClick={thank} className={state.thanked ? "border-transparent bg-brand-tint text-brand-text" : undefined}>
        <span className="relative inline-flex">
          <Icon icon={IconThanks} filled={state.thanked} key={state.burst} className={state.burst ? "pop" : ""} />
          {state.burst > 0 && state.thanked && [0, 1, 2, 3, 4].map((i) => <motion.span key={`${state.burst}-${i}`} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 size-1.5 rounded-full bg-primary" initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i * 1.257) * 22, y: Math.sin(i * 1.257) * 22, opacity: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} />)}
        </span>Merci{state.count > 0 && <span className="tabular-nums">{state.count}</span>}
      </Button>
      {state.error && <span role="alert" className="text-sm text-destructive">{state.error}</span>}
    </>
  );
}

/** Rappel à accepter avant le premier accès à un fichier : le lien reste un vrai lien pour le clavier et les lecteurs d'écran. */
export function GuardedLink({ docId, href, attested, newTab, children }: { docId: string; href: string; attested: boolean; newTab?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(attested);
  const go = async () => {
    await attestDownload(docId);
    setDone(true);
    setOpen(false);
    if (newTab) window.open(href, "_blank", "noopener");
    else window.location.assign(href);
  };
  return (
    <>
      <a className="inline-flex min-h-11 items-center gap-1.5 text-link underline-offset-2 hover:underline fine:min-h-0" href={href} {...(newTab ? { target: "_blank", rel: "noopener" } : {})} onClick={(event) => { if (!done) { event.preventDefault(); setOpen(true); } }}>{children}</a>
      {/* Hors de la page : la grille d'un cours isole ce qui se place par rapport à l'écran */}
      {open && createPortal(
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-label="Avant d’accéder au fichier" className="w-full max-w-md rounded-[0.6rem] bg-card p-5 text-foreground shadow-xl" initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, opacity: 0 }} onClick={(event) => event.stopPropagation()}>
              <p className="mb-3 font-heading text-lg font-semibold">Avant d’accéder au fichier</p>
              <Attest kind="download" name="attest-download" checked={checked} onChange={setChecked} />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button variant="outline"  onClick={() => setOpen(false)}>Annuler</Button>
                <Button  disabled={!checked} onClick={() => void go()}>Continuer</Button>
              </div>
            </motion.div>
          </motion.div>
      , document.body)}
    </>
  );
}
