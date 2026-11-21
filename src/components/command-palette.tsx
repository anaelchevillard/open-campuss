"use client";

import { Command as CommandPrimitive } from "cmdk";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { useCreateSheet } from "@/components/create-sheet";
import { Hint } from "@/components/hint";
import { Icon } from "@/components/icon";
import { AskForm, MeToo, type Similar } from "@/components/search/request-row";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { reportSearchMiss } from "@/components/tracker";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useCoarsePointer } from "@/hooks/use-media";
import { IconAdd, IconCards, IconChevronRight, IconClose, IconFavorite, IconFile, IconFriends, IconKeyboard, IconPeople, IconRequests, IconSearch, IconSubjects, type IconData } from "@/lib/icons";
import { headlineParts } from "@/lib/search-rules";
import { HOME } from "@/lib/home";

type Hit = { href: string; title: string; hint: string };
type TextHit = Hit & { snippet: string };
type Context = { program: string; term: string; requestSubjects: { id: number; name: string; shortName: string }[]; hints: string[] };
type Answer = Context & { recents?: Hit[]; favorites?: Hit[]; subjects?: Hit[]; docs?: Hit[]; text?: TextHit[]; friends?: Hit[]; people?: Hit[]; propose?: boolean; similar?: Similar | null; guessed?: number | null };

const LOCAL = "campuss-recherches";
const TYPES = [["cours", "CM"], ["fiche", "Fiche"], ["td", "TD"], ["partiel", "Partiel"]] as const;
const SHORTCUTS: [string[], string][] = [[["Ctrl", "K"], "Rechercher"], [["/"], "Rechercher"], [["G", "A"], "Accueil"], [["G", "M"], "Matières"], [["G", "R"], "Réviser"], [["N"], "Nouveau"], [["?"], "Raccourcis"]];

const readLocal = (): string[] => { try { return JSON.parse(localStorage.getItem(LOCAL) ?? "[]").filter((x: unknown) => typeof x === "string").slice(0, 5); } catch { return []; } };
const saveLocal = (q: string) => { try { localStorage.setItem(LOCAL, JSON.stringify([q, ...readLocal().filter((x) => x !== q)].slice(0, 5))); } catch { /* navigation privée */ } };
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
const shortcutsOff = () => document.documentElement.classList.contains("no-shortcuts");
const mac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function Row({ icon, hit, onSelect, children }: { icon: IconData; hit: Hit; onSelect: () => void; children?: React.ReactNode }) {
  return (
    <CommandItem value={hit.href + hit.title} onSelect={onSelect} className="min-h-11 items-start gap-3 rounded-lg! px-2.5 py-2 text-base">
      <Icon icon={icon} className="mt-0.5 text-muted-foreground" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2"><span className="truncate font-semibold">{hit.title}</span><span className="shrink-0 truncate text-sm text-muted-foreground">{hit.hint}</span></span>
        {children}
      </span>
    </CommandItem>
  );
}

/**
 * Recherche ⌘K, « / », loupe : Command (cmdk) dans un dialogue, plein écran au téléphone.
 * Avant frappe : récents, favoris, actions. Peu de résultats : « Demander… » sans quitter la palette.
 */
export function CommandPalette({ pages }: { pages: Hit[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sheet = useCreateSheet();
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [types, setTypes] = useState<string | null>(null);
  const [local, setLocal] = useState<string[]>([]);
  const here = /^\/matieres\/(\d+)/.exec(pathname)?.[1] ?? null;
  const [inSubject, setInSubject] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { markNavigating } = useBackToClose(open, close);

  const show = useCallback(() => { setInSubject(Boolean(here)); setLocal(readLocal()); setOpen(true); }, [here]);

  // Raccourcis : ⌘K partout ; les touches seules hors d'un champ, et jamais si la personne les a coupées
  useEffect(() => {
    let pendingG = 0;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (open) close(); else show(); return; }
      if (open || event.ctrlKey || event.metaKey || event.altKey || typing(event.target) || shortcutsOff()) return;
      const key = event.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const to = { a: HOME, m: "/matieres", r: "/reviser" }[key];
        if (to) { event.preventDefault(); router.push(to); }
        return;
      }
      if (key === "/") { event.preventDefault(); show(); }
      else if (key === "g") pendingG = Date.now();
      else if (key === "n") { event.preventDefault(); sheet.open(); }
      else if (event.key === "?") { event.preventDefault(); setHelp(true); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, close, show, router, sheet]);

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => { setQ(""); setAnswer(null); setAsking(false); setTypes(null); }, 200);
    return () => clearTimeout(timer);
  }, [open]);

  // 120 ms après la dernière frappe ; la requête précédente est annulée
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ q: q.trim() });
      if (types) params.set("type", types);
      if (inSubject && here) params.set("matiere", here);
      const data = await fetch(`/api/search?${params}`, { signal: controller.signal }).then((r) => r.json() as Promise<Answer>).catch(() => null);
      if (data && !controller.signal.aborted) { setAnswer(data); setLoading(false); }
    }, q.trim().length < 2 ? 0 : 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, open, types, inSubject, here]);

  // Recherche restée sans cours ni matière 1,5 s après la frappe : comptée une fois (avec accord seulement, côté serveur)
  const missed = useRef(new Set<string>());
  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < 3 || !answer || answer.subjects === undefined) return;
    if ((answer.subjects?.length ?? 0) + (answer.docs?.length ?? 0) + (answer.text?.length ?? 0) > 0 || missed.current.has(query)) return;
    const timer = setTimeout(() => { missed.current.add(query); reportSearchMiss(query); }, 1500);
    return () => clearTimeout(timer);
  }, [answer, q, open]);

  // Les résultats arrivent après la frappe : cmdk garderait l'élément choisi avant (« Tous les résultats »), on revient au premier
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const first = input.current?.closest("[cmdk-root]")?.querySelector("[cmdk-item]")?.getAttribute("data-value");
    if (first) setSelected(first);
  }, [answer]);

  const go = (href: string) => {
    if (q.trim().length >= 2) saveLocal(q.trim());
    markNavigating();
    setOpen(false);
    router.push(href);
  };
  const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const query = q.trim();
  const matchedPages = query.length >= 2 ? pages.filter((p) => fold(p.title).includes(fold(query))).slice(0, 4) : [];
  const searching = query.length >= 2;
  const groups: [string, Hit[], IconData][] = searching && answer
    ? [["Matières", answer.subjects ?? [], IconSubjects], ["Cours", answer.docs ?? [], IconFile], ["Amis", answer.friends ?? [], IconFriends], ["Personnes", answer.people ?? [], IconPeople], ["Pages", matchedPages, IconChevronRight]]
    : [["Récents", answer?.recents ?? [], IconFile], ["Favoris", answer?.favorites ?? [], IconFavorite]];
  const fine = !coarse;

  return (
    <>
      <button type="button" aria-label="Rechercher partout" onClick={show}
        className="flex size-11 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:text-foreground lg:h-9 lg:w-full lg:max-w-xs lg:justify-start lg:bg-muted lg:px-3">
        <Icon icon={IconSearch} size={20} className="lg:size-4" /><span className="hidden lg:inline">Rechercher</span>
        {fine && <Kbd className="ml-auto hidden lg:inline-flex">{mac() ? "⌘K" : "Ctrl K"}</Kbd>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} aria-label="Recherche"
          className="top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 pt-safe sm:max-w-none md:top-[12vh] md:left-1/2 md:h-auto md:max-h-[76vh] md:max-w-xl md:-translate-x-1/2 md:rounded-2xl md:pt-0 motion-ok:data-starting-style:scale-[.98]">
          <DialogHeader className="sr-only"><DialogTitle>Recherche</DialogTitle><DialogDescription>Cours, matières, amis et actions</DialogDescription></DialogHeader>
          <Command shouldFilter={false} loop value={selected} onValueChange={setSelected} className="min-h-0 flex-1 rounded-none! bg-transparent p-0">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Icon icon={IconSearch} className={cn("shrink-0 transition-colors", loading ? "text-brand-text" : "text-muted-foreground")} />
              <CommandPrimitive.Input ref={input} value={q} onValueChange={(v) => { setQ(v); setAsking(false); }} aria-label="Rechercher" placeholder="Un cours, une matière, un ami…" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && !document.querySelector("[cmdk-item][data-selected=true]") && query.length >= 2) { e.preventDefault(); go(`/matieres?q=${encodeURIComponent(query)}`); } }}
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
              <Button variant="ghost" size="icon" onClick={close} aria-label="Fermer la recherche" className="md:hidden"><Icon icon={IconClose} /></Button>
              {fine && <Kbd className="hidden md:inline-flex">Échap</Kbd>}
            </div>
            <div role="group" aria-label="Portée" className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]">
              {here && <Chip active={inSubject} onClick={() => setInSubject((v) => !v)}>Cette matière</Chip>}
              {TYPES.map(([value, label]) => <Chip key={value} active={types === value} onClick={() => setTypes((t) => (t === value ? null : value))}>{label}</Chip>)}
            </div>
            <CommandList className="max-h-none min-h-0 flex-1 overscroll-contain p-1.5 md:max-h-[52vh]">
              {!searching && local.length > 0 && (
                <CommandGroup heading="Recherches récentes">
                  {local.map((text) => (
                    <CommandItem key={text} value={`local:${text}`} onSelect={() => setQ(text)} className="min-h-11 gap-3 rounded-lg! px-2.5 text-base">
                      <Icon icon={IconSearch} className="text-muted-foreground" /><span className="truncate">{text}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {groups.map(([heading, hits, icon]) => hits.length > 0 && (
                <Fragment key={heading}>
                  <CommandGroup heading={heading}>{hits.map((hit) => <Row key={hit.href} icon={icon} hit={hit} onSelect={() => go(hit.href)} />)}</CommandGroup>
                  {heading === "Cours" && (answer?.text?.length ?? 0) > 0 && (
                    <CommandGroup heading="Dans le texte">
                      {answer!.text!.map((hit) => (
                        <Row key={hit.href} icon={IconFile} hit={hit} onSelect={() => go(hit.href)}>
                          <span className="line-clamp-2 text-sm text-muted-foreground">{headlineParts(hit.snippet).map((part, i) => part.mark ? <mark key={i} className="rounded-sm bg-highlighter px-0.5 text-highlighter-ink">{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>)}</span>
                        </Row>
                      ))}
                    </CommandGroup>
                  )}
                </Fragment>
              ))}
              {searching && answer?.propose && (
                <div className="px-1.5 py-2">
                  {answer.similar ? <MeToo similar={answer.similar} /> : asking ? (
                    <AskForm query={query} subjects={answer.requestSubjects} guessed={answer.guessed ?? null} onDone={close} />
                  ) : (
                    <CommandItem value="demander" onSelect={() => setAsking(true)} className="min-h-12 gap-3 rounded-xl! bg-brand-tint px-3 text-base text-brand-text data-selected:bg-brand-tint data-selected:text-brand-text data-selected:ring-2 data-selected:ring-brand-text/40">
                      <Icon icon={IconRequests} />
                      <span className="min-w-0 flex-1">Demander « <span className="font-semibold">{query}</span> » aux étudiants de {answer.program} ?</span>
                    </CommandItem>
                  )}
                </div>
              )}
              {!searching && (
                <CommandGroup heading="Actions">
                  <CommandItem value="action:nouveau" onSelect={() => { setOpen(false); sheet.open(); }} className="min-h-11 gap-3 rounded-lg! px-2.5 text-base"><Icon icon={IconAdd} className="text-muted-foreground" />Nouveau{fine && <Kbd className="ml-auto">N</Kbd>}</CommandItem>
                  <CommandItem value="action:reviser" onSelect={() => go("/reviser")} className="min-h-11 gap-3 rounded-lg! px-2.5 text-base"><Icon icon={IconCards} className="text-muted-foreground" />Réviser les fiches dues</CommandItem>
                  <CommandItem value="action:demander" onSelect={() => go("/demandes?nouvelle=1")} className="min-h-11 gap-3 rounded-lg! px-2.5 text-base"><Icon icon={IconRequests} className="text-muted-foreground" />Demander un cours</CommandItem>
                </CommandGroup>
              )}
              {searching && answer && (
                <CommandGroup>
                  <CommandItem value="action:tout" onSelect={() => go(`/matieres?q=${encodeURIComponent(query)}`)} className="min-h-11 gap-3 rounded-lg! px-2.5 text-base text-muted-foreground">
                    <Icon icon={IconSearch} />Tous les résultats pour « {query} »
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandEmpty className="hidden" />
            </CommandList>
          </Command>
          {fine && (
            <div className="hidden items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground md:flex">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd></span>
              <span className="flex items-center gap-1"><Kbd>Entrée</Kbd>ouvrir</span>
              {answer && (
                <Hint id="palette-raccourcis" text="« / » ouvre aussi la recherche" seen={answer.hints} side="top">
                  <button type="button" onClick={() => setHelp(true)} className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground"><Icon icon={IconKeyboard} size={16} />Raccourcis</button>
                </Hint>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Raccourcis</DialogTitle></DialogHeader>
          <dl className="grid gap-2">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys.join()} className="flex items-center justify-between gap-4">
                <dt className="text-sm">{label}</dt>
                <dd className="flex gap-1">{keys.map((k) => <Kbd key={k}>{k === "Ctrl" && mac() ? "⌘" : k}</Kbd>)}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn("flex min-h-8 shrink-0 items-center rounded-full border px-3 text-sm font-semibold transition-colors coarse:min-h-10", active ? "border-transparent bg-brand-tint text-brand-text" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
