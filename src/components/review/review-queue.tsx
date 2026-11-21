"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ResponsiveMenu, type MenuEntry } from "@/components/responsive-menu";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { ReasonPanel } from "./reason-panel";
import { IconBack, IconExternal, IconKeyboard, IconMore, IconPending, IconTodo, IconWarning } from "@/lib/icons";
import { REVIEW_REASONS } from "@/lib/review-reasons";
import { toastError, toastUndo } from "@/lib/toast";

export { REVIEW_REASONS };

export type QueueItem = {
  id: string; title: string; meta?: string;
  /** Attente affichée sur la ligne ; `late` la met en couleur attention */
  wait?: { label: string; late?: boolean };
  /** Pastille d'alerte de la ligne (origine inconnue…) */
  flag?: string;
  /** Publier est impossible tel quel : « Publier » ouvre Renvoyer avec ce motif présélectionné */
  blockedReason?: number;
};
export type QueueDecision = "accept" | "reject" | "skip";
type Outcome = void | { ok: true } | { error: string };

const ATTEST_MS = 12 * 3_600_000;

/**
 * File de décision commune (À valider, après coup, corrections, fiches IA ; signalements et profils côté admin).
 * Liste à gauche dès 64rem, aperçu centré, barre de décision collante. Raccourcis J/K A R S 1–7 Entrée Z E ? (coupés si
 * `shortcuts` est faux). Une décision passe tout de suite à l'élément suivant ; « Annuler » ou Z la défait.
 */
export function ReviewQueue<T extends QueueItem>({
  items, renderPreview, onDecision, onUndo, acceptLabel = "Publier", rejectLabel = "Renvoyer", acceptDone = "Publié", rejectDone = "Renvoyé",
  openHref, shortcuts = true, empty, reasons: withReasons = true, menu, attest, label = "File",
}: {
  items: T[];
  renderPreview: (item: T) => ReactNode;
  onDecision: (item: T, decision: QueueDecision, reason?: number, word?: string) => Outcome | Promise<Outcome>;
  onUndo?: (item: T, decision: QueueDecision) => void | Promise<unknown>;
  acceptLabel?: string; rejectLabel?: string;
  /** Participe passé du toast : « Publié · Annuler » */
  acceptDone?: string; rejectDone?: string;
  openHref?: (item: T) => string;
  shortcuts?: boolean;
  empty?: ReactNode;
  /** Faux : « Renvoyer » décide tout de suite, sans motif (fiches IA) */
  reasons?: boolean;
  /** Entrées du « … » de la barre, en plus de « Ouvrir en pleine page » */
  menu?: (item: T) => MenuEntry[];
  /** Engagement demandé au premier « Publier » de la séance, retenu 12 h sur l'appareil */
  attest?: { key: string; text: ReactNode };
  label?: string;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const queue = useMemo(() => items.filter((i) => !done.has(i.id)), [items, done]);
  const [index, setIndex] = useState(0);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [reason, setReason] = useState<number | null>(null);
  const [word, setWord] = useState("");
  const [help, setHelp] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [last, setLast] = useState<{ item: T; decision: QueueDecision } | null>(null);
  const wordRef = useRef<HTMLInputElement>(null);
  const at = Math.min(index, Math.max(0, queue.length - 1));
  const current = queue[at];
  useBackToClose(mobilePreview, () => setMobilePreview(false));

  // Le panneau de renvoi appartient à un élément : passer au suivant le ferme
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const rejecting = rejectFor !== null && rejectFor === current?.id;
  const setRejecting = useCallback((open: boolean) => setRejectFor(open ? current?.id ?? null : null), [current?.id]);

  const undo = useCallback((entry: { item: T; decision: QueueDecision }) => {
    setDone((d) => { const n = new Set(d); n.delete(entry.item.id); return n; });
    const back = items.filter((i) => i.id === entry.item.id || !done.has(i.id)).findIndex((i) => i.id === entry.item.id);
    setIndex(Math.max(0, back));
    setLast(null);
    void onUndo?.(entry.item, entry.decision);
  }, [onUndo, items, done]);

  const commit = useCallback(async (decision: QueueDecision, chosen?: number, text?: string) => {
    if (!current) return;
    if (decision === "skip") { setIndex((i) => (i + 1 >= queue.length ? 0 : i + 1)); return; }
    const item = current;
    setRejecting(false);
    setDone((d) => new Set(d).add(item.id));
    const entry = { item, decision };
    setLast(entry);
    const result = await onDecision(item, decision, chosen, text?.trim() || undefined);
    if (result && "error" in result) {
      setDone((d) => { const n = new Set(d); n.delete(item.id); return n; });
      setLast(null);
      toastError(result.error);
      return;
    }
    const title = item.title.trim() || "Sans titre";
    if (onUndo) toastUndo(`${decision === "accept" ? acceptDone : rejectDone} · ${title}`, () => undo(entry));
  }, [current, queue.length, onDecision, onUndo, acceptDone, rejectDone, undo, setRejecting]);

  const startReject = useCallback((preset?: number) => {
    if (!withReasons) { void commit("reject"); return; }
    setRejecting(true);
    setReason(null);
    setWord("");
    // Le champ ne prend le focus qu'une fois le motif choisi : les chiffres 1 à 7 restent des raccourcis
    if (preset) { setReason(preset); window.setTimeout(() => wordRef.current?.focus({ preventScroll: true }), 50); }
  }, [withReasons, commit, setRejecting]);

  const accept = useCallback(() => {
    if (!current) return;
    if (current.blockedReason) { startReject(current.blockedReason); return; }
    if (attest) {
      let ok = false;
      try { ok = Date.now() - Number(localStorage.getItem(attest.key) ?? 0) < ATTEST_MS; } catch { /* stockage indisponible */ }
      if (!ok) { setAttesting(true); return; }
    }
    void commit("accept");
  }, [current, attest, startReject, commit]);

  const confirmReject = useCallback(() => {
    if (!reason) { toastError("Choisis un motif"); return; }
    void commit("reject", reason, word);
  }, [reason, word, commit]);

  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || help || attesting) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) {
        if (event.key === "Escape" && rejecting) { setRejecting(false); event.preventDefault(); }
        return;
      }
      const k = event.key.toLowerCase();
      // Pendant un renvoi, une lettre tapée avant que le champ ait le focus va dans le mot pour l'auteur,
      // jamais vers un raccourci (« e » ouvrirait le document, « a » le publierait)
      if (rejecting && event.key.length === 1 && !/^[1-7?]$/.test(k) && wordRef.current) { wordRef.current.focus({ preventScroll: true }); return; }
      if (rejecting && /^[1-7]$/.test(k)) { setReason(Number(k)); window.setTimeout(() => wordRef.current?.focus({ preventScroll: true }), 0); }
      else if (rejecting && k === "enter") confirmReject();
      else if (rejecting && k === "escape") setRejecting(false);
      else if (k === "j" || k === "arrowdown") setIndex((i) => Math.min(i + 1, queue.length - 1));
      else if (k === "k" || k === "arrowup") setIndex((i) => Math.max(i - 1, 0));
      else if (k === "a" || k === "p") accept();
      else if (k === "r") startReject();
      else if (k === "s") void commit("skip");
      else if (k === "z" && last && onUndo) undo(last);
      else if (k === "e" && current && openHref) window.location.assign(openHref(current));
      else if (k === "?") setHelp(true);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, queue.length, rejecting, setRejecting, confirmReject, accept, startReject, commit, last, onUndo, undo, current, openHref, help, attesting]);

  if (!queue.length) return <>{empty ?? <EmptyState icon={IconTodo} title="Rien à traiter" />}</>;
  const k = (key: string, className?: string) => (shortcuts ? <Kbd className={cn("coarse:hidden", className)}>{key}</Kbd> : null);
  const menuEntries: MenuEntry[] = [
    ...(current && openHref ? [{ label: "Ouvrir en pleine page", icon: IconExternal, href: openHref(current) }] : []),
    ...(current && menu ? menu(current) : []),
    ...(shortcuts ? [{ label: "Raccourcis", icon: IconKeyboard, onSelect: () => setHelp(true), separatorBefore: true }] : []),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-8">
      <nav aria-label={label} className={cn("lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1", mobilePreview && "max-lg:hidden")}>
        <ol className="stagger grid gap-1 max-lg:gap-2">
          {queue.map((item, i) => (
            <li key={item.id}>
              <button type="button" onClick={() => { setIndex(i); setMobilePreview(true); }} aria-current={item.id === current?.id ? "true" : undefined}
                className="group/row flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-(--dur-fast) hover:bg-muted max-lg:rounded-xl max-lg:bg-card max-lg:shadow-xs lg:aria-[current]:bg-brand-tint">
                <span className="line-clamp-2 font-semibold lg:group-aria-[current]/row:text-brand-text">{item.title.trim() || "Sans titre"}</span>
                {item.meta && <span className="line-clamp-1 text-sm text-muted-foreground">{item.meta}</span>}
                {(item.wait || item.flag) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
                    {item.wait && <span className={cn("flex items-center gap-1", item.wait.late ? "text-warning-foreground" : "text-muted-foreground")}><Icon icon={item.wait.late ? IconWarning : IconPending} size={16} className="size-3.5" />{item.wait.label}</span>}
                    {item.flag && <span className="flex items-center gap-1 rounded-full bg-warning-tint px-2 py-0.5 text-warning-foreground"><Icon icon={IconWarning} size={16} className="size-3.5" />{item.flag}</span>}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {current && (
        <section aria-label="Aperçu" className={cn("flex min-h-[calc(100dvh-17rem)] min-w-0 flex-col", !mobilePreview && "max-lg:hidden")}>
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 lg:hidden" onClick={() => setMobilePreview(false)}><Icon icon={IconBack} size={16} />{label}</Button>
          <div key={current.id} className="queue-in mx-auto max-w-(--measure) pb-4">{renderPreview(current)}</div>

          {/* Toujours en bas de l'écran : la colonne occupe au moins la hauteur visible, la barre descend (mt-auto) puis colle */}
          <div className="sticky bottom-[calc(var(--bottom-offset)+0.5rem)] z-(--z-sticky) mx-auto mt-auto w-full max-w-[44rem] pt-6">
            <div className="grid gap-3 rounded-2xl bg-popover p-2 shadow-md motion-ok:animate-rise">
              {rejecting && <ReasonPanel reason={reason} onReason={setReason} word={word} onWord={setWord} onSubmit={confirmReject} onClose={() => setRejecting(false)} submitLabel={rejectLabel} shortcuts={shortcuts} wordRef={wordRef} />}
              <div className="flex items-center gap-2">
                <span className="hidden px-2 text-sm text-muted-foreground tabular-nums sm:inline">{at + 1} / {queue.length}</span>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                  <Button variant="ghost" onClick={() => void commit("skip")}>Passer{k("S")}</Button>
                  {menuEntries.length > 0 && <ResponsiveMenu title="Plus" items={menuEntries} trigger={<Button variant="ghost" size="icon-lg" aria-label="Plus d’actions"><Icon icon={IconMore} /></Button>} />}
                  <Button variant="outline" aria-expanded={withReasons ? rejecting : undefined} onClick={() => (rejecting ? setRejecting(false) : startReject())}>{rejectLabel}{k("R")}</Button>
                  <Button onClick={accept}>{acceptLabel}{k("A", "bg-white/15 text-primary-foreground")}</Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {attest && (
        <ResponsiveSheet open={attesting} onOpenChange={setAttesting} title="Avant de publier" size="sm"
          footer={<Button onClick={() => { try { localStorage.setItem(attest.key, String(Date.now())); } catch { /* stockage indisponible */ } setAttesting(false); void commit("accept"); }}>J’ai vérifié, publier</Button>}>
          <p className="pb-2 text-pretty">{attest.text}</p>
          <p className="pb-2 text-sm text-muted-foreground">Demandé une fois par séance de relecture</p>
        </ResponsiveSheet>
      )}
      <ResponsiveSheet open={help} onOpenChange={setHelp} title="Raccourcis" size="sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 pb-2 text-sm">
          {[["J / K", "suivant, précédent"], ["A", acceptLabel], ["R", rejectLabel], ...(withReasons ? [["1 à 7", "motif"], ["Entrée", "confirmer le renvoi"]] : []), ["S", "passer"], ["Z", "annuler la dernière décision"], ...(openHref ? [["E", "ouvrir en pleine page"]] : [])].map(([key, v]) => <div key={key} className="contents"><dt><Kbd>{key}</Kbd></dt><dd>{v}</dd></div>)}
        </dl>
      </ResponsiveSheet>
    </div>
  );
}
