"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

export type SaveOutcome = { ok: true } | { ok: false; error: string } | void;
/** Une modification en attente : comment l'enregistrer, et comment revenir à l'état enregistré. */
export type Pending = { save: () => Promise<SaveOutcome>; revert?: () => void };

type Scope = { stage: (key: string, pending: Pending | null) => void; dirty: boolean; saving: boolean; save: () => Promise<boolean>; revert: () => void };
const ScopeContext = createContext<Scope | null>(null);

/** La portée d'enregistrement autour d'un formulaire de compte (null hors d'une page de réglages). */
export const useSaveScope = () => useContext(ScopeContext);

/**
 * Déclare une modification en attente sous `key` (null : rien à enregistrer).
 * Le dernier `pending` est gardé dans une ref : le rendu suivant ne repart pas en boucle.
 */
export function useStaged(key: string, pending: Pending | null) {
  const scope = useSaveScope();
  const stage = scope?.stage;
  useEffect(() => { stage?.(key, pending); });
  useEffect(() => () => stage?.(key, null), [stage, key]);
}

/**
 * Modifications de compte : rien ne part avant « Enregistrer ». Barre collante quand il y a du nouveau,
 * garde de sortie (fermeture de l'onglet et liens internes). Les champs se déclarent avec `useStaged`.
 */
export function SaveScope({ children, className, onSaved }: { children: ReactNode; className?: string; onSaved?: () => void }) {
  const router = useRouter();
  const entries = useRef(new Map<string, Pending>());
  const root = useRef<HTMLDivElement>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const stage = useCallback((key: string, pending: Pending | null) => {
    const had = entries.current.has(key);
    if (pending) entries.current.set(key, pending); else entries.current.delete(key);
    if (had !== Boolean(pending)) setKeys([...entries.current.keys()]);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    const failed: string[] = [];
    for (const [key, pending] of [...entries.current]) {
      try {
        const result = await pending.save();
        if (result && !result.ok) failed.push(result.error);
        else entries.current.delete(key);
      } catch {
        failed.push("Pas enregistré : vérifie ta connexion");
      }
    }
    setKeys([...entries.current.keys()]);
    setErrors(failed);
    setSaving(false);
    if (failed.length) return false;
    toast("Modifications enregistrées");
    onSaved?.();
    router.refresh();
    return true;
  }, [onSaved, router]);

  const revert = useCallback(() => {
    for (const pending of entries.current.values()) pending.revert?.();
    entries.current.clear();
    setKeys([]);
    setErrors([]);
  }, []);

  const dirty = keys.length > 0;
  const scope = useMemo(() => ({ stage, dirty, saving, save, revert }), [stage, dirty, saving, save, revert]);
  return (
    <ScopeContext.Provider value={scope}>
      <div ref={root} className={cn("grid grid-cols-1 gap-8", className)}>
        {children}
        <SaveBar dirty={dirty} saving={saving} errors={errors} onSave={() => void save()} onRevert={revert} />
      </div>
      <LeaveGuard dirty={dirty} saving={saving} onSave={save} onDiscard={revert} root={root} />
    </ScopeContext.Provider>
  );
}

/** Barre « Enregistrer » collée en bas de l'écran, au-dessus de la barre d'onglets du téléphone. */
function SaveBar({ dirty, saving, errors, onSave, onRevert }: { dirty: boolean; saving: boolean; errors: string[]; onSave: () => void; onRevert: () => void }) {
  if (!dirty && !errors.length) return null;
  return (
    <div role="region" aria-label="Enregistrer les modifications"
      className="sticky bottom-[calc(var(--bottom-offset)+0.75rem)] z-(--z-sticky) grid gap-2 rounded-xl bg-card p-3 shadow-md ring-1 ring-border animate-[notice-in_200ms_ease-out] lg:bottom-4">
      {errors.map((error) => <p key={error} role="alert" className="text-sm text-destructive-foreground">{error}</p>)}
      {dirty && (
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-end">
          <span role="status" className="text-sm text-muted-foreground sm:mr-auto">Modifications non enregistrées</span>
          {/* Deux vrais boutons, toujours sur une ligne (390 px compris) */}
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" disabled={saving} onClick={onRevert} className="whitespace-nowrap">Annuler</Button>
            <Button pending={saving} onClick={onSave} className="whitespace-nowrap">Enregistrer</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Champs de saisie libre : les cases, interrupteurs et listes passent tous par des brouillons (useStaged)
const TYPED = new Set(["text", "email", "password", "number", "tel", "url", "date", "time", "datetime-local"]);

/**
 * Champs natifs remplis mais pas envoyés (mot de passe, nouvelle adresse, code de double authentification…) :
 * ces formulaires s'envoient avec leur propre bouton, hors brouillons. React garde l'attribut `value`
 * des champs contrôlés à jour : seuls les champs libres diffèrent de leur valeur d'origine.
 */
export function unsentFields(root: HTMLElement | null) {
  if (!root) return false;
  for (const field of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
    if (field.disabled || field.readOnly || field.closest("[data-no-guard]")) continue;
    if (field.tagName === "INPUT" && !TYPED.has((field as HTMLInputElement).type)) continue;
    if (field.value !== field.defaultValue) return true;
  }
  return false;
}

/** Lien interne qui quitte la page (pas une ancre de la même page, pas un nouvel onglet). */
function leavingHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return null;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return null;
  if (url.pathname === location.pathname && url.search === location.search) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * Garde de sortie : le navigateur demande confirmation à la fermeture (« Quitter le site ? »), pour un brouillon
 * comme pour un champ natif rempli mais pas envoyé (`root`) ; un lien interne ouvre
 * « Modifications non enregistrées : Annuler / Enregistrer » (brouillons seulement : eux seuls s'enregistrent ici).
 */
export function LeaveGuard({ dirty, saving, onSave, onDiscard, root }: { dirty: boolean; saving: boolean; onSave: () => Promise<boolean>; onDiscard: () => void; root?: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (dirty || !root) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!unsentFields(root.current)) return;
      event.preventDefault();
      event.returnValue = ""; // Safari
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty, root]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const intercept = (event: MouseEvent) => {
      const href = leavingHref(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(href);
    };
    addEventListener("beforeunload", warn);
    document.addEventListener("click", intercept, true);
    return () => { removeEventListener("beforeunload", warn); document.removeEventListener("click", intercept, true); };
  }, [dirty]);
  const go = (href: string) => { setTarget(null); router.push(href); };
  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) setTarget(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifications non enregistrées</DialogTitle>
          <DialogDescription>Enregistre-les avant de quitter la page, ou annule-les.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => { const href = target; onDiscard(); if (href) go(href); }}>Annuler</Button>
          <Button pending={saving} onClick={async () => { const href = target; if (await onSave() && href) go(href); }}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
