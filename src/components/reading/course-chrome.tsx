"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { cn } from "cn";
import { saveProgress, toggleFavorite } from "@/app/actions/favorites";
import { toggleRevised } from "@/app/actions/reading";
import { MARKED_READ, MEMO_GENERATE, NOTES_COUNT, openNotesPanel, openPodcast, writeMemoCard } from "@/components/reading/events";
import { regenerateQuiz } from "@/app/actions/study";
import { Icon } from "@/components/icon";
import { ReadingSettings } from "@/components/reading-settings";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { ShareCourse } from "@/components/share-course";
import { TocSheet, type TocExtra, type TocItem } from "@/components/reading/doc-frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCoarsePointer } from "@/hooks/use-media";
import {
  IconAiCards, IconAiQuiz, IconCards, IconDone, IconDownload, IconEdit, IconExpand, IconFavorite, IconFile, IconMore, IconNote,
  IconListen, IconQuiz, IconRevise, IconSuccess, IconToc, IconTogether, type IconData,
} from "@/lib/icons";
import { toast } from "@/lib/toast";

export type ReviseEntry = { key: string; label: string; icon: IconData; href?: string; onSelect?: () => void; ai?: boolean; separatorBefore?: boolean };
export type MoreEntry = { label: string; href?: string; onSelect?: () => void; icon?: IconData };

const cssText = (value: string, max = 90) => {
  const flat = value.replace(/\s+/g, " ").trim();
  return `"${(flat.length > max ? `${flat.slice(0, max - 1)}…` : flat).replace(/[\\"]/g, "\\$&")}"`;
};

/**
 * En-têtes et pieds de chaque page du PDF officiel (boîtes de marge de @page) : Campuss et la matière en haut,
 * la mention « Pour <nom>, ne pas rediffuser » et le numéro de page en bas. Les textes viennent du bloc [data-print-meta] du cours.
 */
function pageMargins() {
  const meta = document.querySelector<HTMLElement>("[data-print-meta]")?.dataset;
  if (!meta) return "";
  const box = "font-family: \"Source Sans 3\", sans-serif; font-size: 8pt; color: #5c5357;";
  const top = [meta.subject, meta.title].filter(Boolean).join(" · ");
  const notice = meta.reader ? `Pour ${meta.reader}, ne pas rediffuser` : "Ne pas rediffuser";
  // La mention de diffusion est en pied de page, à 8 pt et en gris foncé (lisible), le numéro de page à droite
  return `@media print { @page {
    @top-left { content: "Campuss"; ${box} font-weight: 600; color: #a10e2f; }
    @top-right { content: ${cssText(top, 80)}; ${box} }
    @bottom-left { content: ${cssText(notice, 70)}; ${box} font-size: 8.5pt; color: #3d3438; }
    @bottom-right { content: "Page " counter(page) " sur " counter(pages); ${box} }
  }
  @page :first { @top-left { content: none; } @top-right { content: none; } } }`;
}

/** Le PDF du cours passe par l'impression du navigateur, dans la mise en page officielle de Campuss. */
export function printCourse(withNotes: boolean) {
  const html = document.documentElement;
  html.classList.toggle("print-notes", withNotes);
  const style = document.createElement("style");
  style.textContent = pageMargins();
  document.head.append(style);
  const done = () => { html.classList.remove("print-notes"); style.remove(); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  window.print();
}

export async function saveOffline(path: string) {
  const worker = await navigator.serviceWorker?.ready.catch(() => null);
  if (!worker?.active) return toast("Hors ligne indisponible ici");
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => toast(event.data?.ok ? "Disponible hors ligne" : "Échec, réessaie");
  worker.active.postMessage({ type: "save-page", path }, [channel.port2]);
}

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Entrées du menu Réviser, communes à la barre d'actions et à la barre de lecture. */
export function useReviseEntries({ docId, quizReady, revised: initialRevised, course, published, ai, memo, canRegenerateQuiz }: { docId: string; quizReady: boolean; revised: boolean; course: boolean; published: boolean; ai: boolean; memo: boolean; canRegenerateQuiz: boolean }) {
  const router = useRouter();
  const [revised, setRevised] = useState(initialRevised);
  const [, start] = useTransition();
  // Une valeur neuve du serveur remplace la locale : ajustée pendant le rendu, sans effet
  const [seen, setSeen] = useState(initialRevised);
  if (seen !== initialRevised) { setSeen(initialRevised); setRevised(initialRevised); }
  const toggle = () => start(async () => { const result = await toggleRevised(docId); setRevised(result.revised); if (result.revised) toast("Marqué comme révisé"); router.refresh(); });
  const entries: ReviseEntry[] = [
    ...(quizReady ? [{ key: "quiz", label: "Quiz", icon: IconQuiz, href: `/d/${docId}/quiz` }] : []),
    // Une fiche s'écrit à tout moment, sans attendre d'avoir fini le cours
    { key: "memo", label: "Créer une fiche mémo", icon: IconCards, onSelect: writeMemoCard },
    ...(course && published ? [{ key: "together", label: "Réviser à plusieurs", icon: IconTogether, onSelect: openNotesPanel }] : []),
    { key: "revised", label: revised ? "Révisé" : "Marquer comme révisé", icon: revised ? IconDone : IconSuccess, onSelect: toggle },
    ...(ai && !memo ? [{ key: "ai-cards", label: "Générer des fiches", icon: IconAiCards, ai: true, separatorBefore: true, onSelect: () => { scrollToId("fiches-memo"); dispatchEvent(new Event(MEMO_GENERATE)); } }] : []),
    ...(ai && canRegenerateQuiz ? [{ key: "ai-quiz", label: "Générer un quiz", icon: IconAiQuiz, ai: true, separatorBefore: !(ai && !memo), onSelect: () => start(async () => { const form = new FormData(); form.set("id", docId); await regenerateQuiz(form); toast("Campuss IA prépare le quiz"); router.refresh(); }) }] : []),
  ];
  return entries;
}

/** Réviser ▾ : le seul bouton plein de la page de cours. Liste déroulante à la souris, feuille basse au doigt. */
export function ReviseMenu({ entries, trigger }: { entries: ReviseEntry[]; trigger: ReactElement }) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const label = (e: ReviseEntry) => <span className={cn(e.ai && "ai-text font-semibold")}>{e.label}</span>;
  if (coarse) return (
    <>
      <span className="contents" onClick={() => setOpen(true)}>{trigger}</span>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Réviser">
        <ul className="-mx-2 grid pb-2">
          {entries.map((e) => {
            const cls = "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base hover-ok:bg-muted";
            const inner = <><Icon icon={e.icon} className={e.ai ? "text-[var(--ai-3)]" : "text-muted-foreground"} />{label(e)}</>;
            return (
              <li key={e.key} className={cn(e.separatorBefore && "mt-1 border-t border-border pt-1")}>
                {e.href ? <Link href={e.href} className={cls} onClick={() => setOpen(false)}>{inner}</Link>
                  : <button type="button" className={cls} onClick={() => { setOpen(false); e.onSelect?.(); }}>{inner}</button>}
              </li>
            );
          })}
        </ul>
      </ResponsiveSheet>
    </>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" className="min-w-56">
        {entries.map((e) => (
          <DropdownMenuGroup key={e.key}>
            {e.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={e.onSelect} render={e.href ? <Link href={e.href} /> : undefined}>
              <Icon icon={e.icon} size={16} className={e.ai ? "text-[var(--ai-3)]" : undefined} />{label(e)}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Bouton d'icône avec infobulle : la barre d'actions reste calme, le mot apparaît au survol. */
function IconAction({ label, icon, onClick, href, pressed, children, className }: { label: string; icon: IconData; onClick?: () => void; href?: string; pressed?: boolean; children?: ReactNode; className?: string }) {
  const button = href
    ? <Link href={href} data-slot="button" className={cn(buttonVariants({ variant: "ghost", size: children ? "default" : "icon" }), className)} aria-label={label}><Icon icon={icon} />{children}</Link>
    : <Button variant="ghost" size={children ? "default" : "icon"} aria-label={label} aria-pressed={pressed} onClick={onClick} className={className}><Icon icon={icon} filled={pressed} className={cn(pressed && "pop text-brand-text")} />{children}</Button>;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function useNotesCount(initial: number) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    const onCount = (event: Event) => setCount((event as CustomEvent<number>).detail);
    addEventListener(NOTES_COUNT, onCount);
    return () => removeEventListener(NOTES_COUNT, onCount);
  }, []);
  return count;
}

function FavoriteToggle({ docId, initial }: { docId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return <IconAction label={on ? "Retirer des favoris" : "Favori"} icon={IconFavorite} pressed={on} onClick={async () => { const next = !on; setOn(next); setOn(await toggleFavorite(docId).catch(() => !next)); }} />;
}

/** « Marquer comme lu » du menu ⋯ : le cours sort de « Reprendre » ; l'inverse le remet au début. */
function useMarkRead(docId: string, initial: boolean): MoreEntry {
  const [read, setRead] = useState(initial);
  const mark = async () => {
    const next = !read;
    setRead(next);
    dispatchEvent(new CustomEvent(MARKED_READ, { detail: next }));
    const ok = await saveProgress(docId, next ? 100 : 0).then(() => true, () => false);
    if (!ok) { setRead(!next); return toast("Échec, réessaie"); }
    toast(next ? "Marqué comme lu" : "Marqué comme non lu");
  };
  return read ? { label: "Marquer comme non lu", icon: IconDone, onSelect: () => void mark() } : { label: "Marquer comme lu", icon: IconSuccess, onSelect: () => void mark() };
}

type ToolbarProps = {
  docId: string; read: boolean; reviseEntries: Omit<Parameters<typeof useReviseEntries>[0], "docId">; favorite: boolean; course: boolean; shareable: boolean;
  notes: number; hideNotes?: boolean; editHref?: string; more: MoreEntry[]; files: number; offlinePath?: string;
};

function DownloadMenu({ course, files, offlinePath, trigger }: { course: boolean; files: number; offlinePath?: string; trigger: ReactElement }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" className="min-w-60">
        {course && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>PDF du cours</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => printCourse(false)}><Icon icon={IconFile} size={16} />Sans annotations</DropdownMenuItem>
            <DropdownMenuItem onClick={() => printCourse(true)}><Icon icon={IconNote} size={16} />Avec mes annotations</DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        {files > 0 && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => scrollToId("pieces-jointes")}><Icon icon={IconDownload} size={16} />Pièces jointes ({files})</DropdownMenuItem></>}
        {offlinePath && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void saveOffline(offlinePath)}><Icon icon={IconDone} size={16} />Garder hors ligne</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MoreMenu({ items, trigger }: { items: MoreEntry[]; trigger: ReactElement }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="min-w-56">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onClick={item.onSelect} render={item.href ? <Link href={item.href} /> : undefined}>
            {item.icon && <Icon icon={item.icon} size={16} />}{item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Barre d'actions du cours (≥ 768 px) : collante sous l'en-tête une fois dépassée, avec la progression de lecture. */
export function DocToolbar({ docId, read, reviseEntries, favorite, course, shareable, notes: initialNotes, hideNotes, editHref, more, files, offlinePath }: ToolbarProps) {
  const entries = useReviseEntries({ docId, ...reviseEntries });
  const notes = useNotesCount(initialNotes);
  const markRead = useMarkRead(docId, read);
  const moreItems = course ? [markRead, ...more] : more;
  const bar = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    // La position collante (sous l'en-tête, avec sa marge) vient du CSS : on la relit plutôt que de la recopier
    const onScroll = () => setStuck(el.getBoundingClientRect().top <= (parseFloat(getComputedStyle(el).top) || 64) + 1 && scrollY > 40);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div ref={bar} data-stuck={stuck || undefined} className="doc-actionbar -mx-3 mt-5 max-md:hidden print:hidden rounded-xl bg-background/95 backdrop-blur-md transition-shadow duration-(--dur-base)">
      <div role="toolbar" aria-label="Actions du cours" className="flex min-h-11 items-center gap-1 px-2">
        <ReviseMenu entries={entries} trigger={<Button className="mr-2"><Icon icon={IconRevise} />Réviser<Icon icon={IconExpand} size={16} /></Button>} />
        <DownloadMenu course={course} files={files} offlinePath={offlinePath} trigger={<Button variant="ghost" size="icon" aria-label="Télécharger"><Icon icon={IconDownload} /></Button>} />
        <FavoriteToggle docId={docId} initial={favorite} />
        {shareable && <ShareCourse docId={docId} />}
        {course && <IconAction label="Écouter le cours" icon={IconListen} onClick={openPodcast} />}
        {course && !hideNotes && <IconAction label="Notes" icon={IconNote} onClick={openNotesPanel}>{notes > 0 && <span className="tabular-nums">{notes}</span>}</IconAction>}
        <span className="ml-auto flex items-center gap-1">
          {editHref && <Link href={editHref} data-slot="button" className={buttonVariants({ variant: "ghost" })}><Icon icon={IconEdit} />Modifier</Link>}
          <ReadingSettings />
          {moreItems.length > 0 && <MoreMenu items={moreItems} trigger={<Button variant="ghost" size="icon" aria-label="Autres actions"><Icon icon={IconMore} /></Button>} />}
        </span>
      </div>
      {stuck && course && <span aria-hidden="true" className="read-progress block h-0.5 rounded-full bg-primary" />}
    </div>
  );
}

/**
 * Téléphone : Sommaire · Notes · Réviser · … dans une barre flottante au-dessus des onglets (qui ne changent jamais).
 * En descendant, elle se rétracte en un petit bouton rond à droite, qui la rouvre ; en remontant, elle se déploie.
 */
export function ReadingBar({ docId, read, reviseEntries, favorite, course, shareable, notes: initialNotes, hideNotes, editHref, more, files, offlinePath, toc, extras }: ToolbarProps & { toc: TocItem[]; extras: TocExtra[] }) {
  const entries = useReviseEntries({ docId, ...reviseEntries });
  const notes = useNotesCount(initialNotes);
  const [tocOpen, setTocOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const markRead = useMarkRead(docId, read);
  const [fav, setFav] = useState(favorite);
  useEffect(() => {
    if (document.documentElement.classList.contains("fixed-bars")) return;
    let last = scrollY;
    const onScroll = () => { const y = scrollY; if (Math.abs(y - last) < 8) return; setCollapsed(y > last && y > 120); last = y; };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);
  // Barre compacte : icônes seules (nom au lecteur d'écran et en infobulle), 44 px de haut
  const cell = "flex min-h-11 flex-1 items-center justify-center rounded-full text-muted-foreground hover-ok:text-foreground";
  const sheetItems: MoreEntry[] = [
    ...(course ? [{ label: "Écouter le cours", icon: IconListen, onSelect: openPodcast }, markRead] : []),
    ...(files ? [{ label: `Pièces jointes (${files})`, icon: IconDownload, onSelect: () => scrollToId("pieces-jointes") }] : []),
    { label: fav ? "Retirer des favoris" : "Ajouter aux favoris", icon: IconFavorite, onSelect: async () => { const next = !fav; setFav(next); setFav(await toggleFavorite(docId).catch(() => !next)); toast(next ? "Ajouté aux favoris" : "Retiré des favoris"); } },
    ...(editHref ? [{ label: "Modifier", icon: IconEdit, href: editHref }] : []),
    ...(offlinePath ? [{ label: "Garder hors ligne", icon: IconDone, onSelect: () => void saveOffline(offlinePath) }] : []),
    ...more,
  ];
  return (
    <>
      <nav data-reading-bar data-hidden={collapsed || undefined} aria-label="Lecture" inert={collapsed || undefined}
        className="reading-bar fixed inset-x-3 bottom-[calc(var(--bottom-offset)+0.5rem)] z-(--z-sticky) mx-auto max-w-[600px] rounded-full bg-card/95 shadow-md ring-1 ring-border backdrop-blur-md md:hidden print:hidden">
        <div className="flex h-12 items-center px-1">
          {course && toc.length > 1 && <button type="button" className={cell} aria-label="Sommaire" title="Sommaire" onClick={() => setTocOpen(true)}><Icon icon={IconToc} size={24} /></button>}
          {/* Annoter et le PDF sont en vue au téléphone, pas cachés dans « Plus » */}
          {course && !hideNotes && <button type="button" className={cell} aria-label={notes > 0 ? `Annoter, ${notes} notes` : "Annoter"} title="Annoter" onClick={openNotesPanel}><span className="relative"><Icon icon={IconNote} size={24} />{notes > 0 && <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-semibold text-primary-foreground tabular-nums">{notes}</span>}</span></button>}
          <div className="flex flex-[1.4] items-center justify-center px-1">
            <ReviseMenu entries={entries} trigger={<Button size="sm" className="w-full rounded-full"><Icon icon={IconRevise} />Réviser</Button>} />
          </div>
          {course && <button type="button" className={cell} aria-label="Télécharger le PDF" title="PDF" onClick={() => (hideNotes ? printCourse(false) : setPdfOpen(true))}><Icon icon={IconFile} size={24} /></button>}
          <button type="button" className={cell} onClick={() => setMoreOpen(true)} aria-label="Autres actions" title="Plus"><Icon icon={IconMore} size={24} /></button>
        </div>
      </nav>
      <button type="button" data-shown={collapsed || undefined} tabIndex={collapsed ? 0 : -1} aria-hidden={!collapsed || undefined} aria-label="Afficher la barre de lecture" title="Actions du cours"
        onClick={() => setCollapsed(false)}
        className="reading-bar-fab fixed right-3 bottom-[calc(var(--bottom-offset)+0.5rem)] z-(--z-sticky) flex size-12 items-center justify-center rounded-full bg-card/95 text-foreground shadow-md ring-1 ring-border backdrop-blur-md after:absolute after:-inset-1 md:hidden print:hidden">
        <Icon icon={IconMore} size={24} />
        {course && !hideNotes && notes > 0 && <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-semibold text-primary-foreground tabular-nums">{notes}</span>}
      </button>
      {course && !hideNotes && (
        <ResponsiveSheet open={pdfOpen} onOpenChange={setPdfOpen} title="PDF du cours" size="sm">
          <ul className="-mx-2 grid pb-2">
            {[{ label: "Sans annotations", icon: IconFile, notes: false }, { label: "Avec mes annotations", icon: IconNote, notes: true }].map((choice) => (
              <li key={choice.label}><button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base hover-ok:bg-muted" onClick={() => { setPdfOpen(false); setTimeout(() => printCourse(choice.notes), 250); }}><Icon icon={choice.icon} className="text-muted-foreground" />{choice.label}</button></li>
            ))}
          </ul>
        </ResponsiveSheet>
      )}
      {course && <TocSheet open={tocOpen} onOpenChange={setTocOpen} items={toc} extras={extras} />}
      <ResponsiveSheet open={moreOpen} onOpenChange={setMoreOpen} title="Actions" hideTitle>
        <ul className="-mx-2 grid pb-2">
          {sheetItems.map((item) => {
            const cls = "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base hover-ok:bg-muted";
            const inner = <>{item.icon && <Icon icon={item.icon} className="text-muted-foreground" />}{item.label}</>;
            return <li key={item.label}>{item.href ? <Link href={item.href} className={cls} onClick={() => setMoreOpen(false)}>{inner}</Link> : <button type="button" className={cls} onClick={() => { setMoreOpen(false); item.onSelect?.(); }}>{inner}</button>}</li>;
          })}
        </ul>
        {shareable && <div className="flex items-center gap-2 border-t border-border pt-3"><ShareCourse docId={docId} withLabel /><ReadingSettings /></div>}
      </ResponsiveSheet>
    </>
  );
}

/** Le bloc de fin apparaît en douceur quand on arrive au bout du texte. */
export function EndBlock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setSeen(true); observer.disconnect(); } }, { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <section ref={ref} aria-label="Fin du cours" data-seen={seen || undefined} className={cn("mt-12 rounded-xl bg-card p-5 shadow-xs ring-1 ring-border/60 print:hidden md:p-6", seen && "motion-ok:animate-rise")}>{children}</section>;
}

export function RevisedButton({ docId, initial }: { docId: string; initial: boolean }) {
  const router = useRouter();
  const [revised, setRevised] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" disabled={pending} aria-pressed={revised} onClick={() => start(async () => { const r = await toggleRevised(docId); setRevised(r.revised); router.refresh(); })}>
      <Icon icon={revised ? IconDone : IconSuccess} className={cn(revised && "pop text-success")} />{revised ? "Révisé" : "Marquer comme révisé"}
    </Button>
  );
}
