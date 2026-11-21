"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { OPEN_PODCAST } from "@/components/reading/events";
import { IconClose, IconListen, IconNext, IconPause, IconPlay, IconPrevious } from "@/lib/icons";
import { nextSpeed, pickFrenchVoice, podcastChunks, type Chunk } from "@/lib/podcast";

/** Les blocs lus à voix haute, dans l'ordre du cours. */
const BLOCKS = "h2, h3, p, li, summary, th, td, pre, blockquote";

/** Texte propre d'un bloc, sans les blocs qu'il contient (lus à leur tour) ni le balisage des formules. */
function ownText(el: Element) {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(BLOCKS).forEach((inner) => inner.remove());
  copy.querySelectorAll(".katex").forEach((math) => math.replaceWith(" formule "));
  return copy.textContent ?? "";
}

function readCourse() {
  const article = document.querySelector("article.course");
  const elements = article ? [...article.querySelectorAll<HTMLElement>(BLOCKS)] : [];
  return { elements, chunks: podcastChunks(elements.map(ownText)) };
}

type Saved = { index: number; rate: number };
const load = (key: string): Saved => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<Saved>;
    return { index: Number.isInteger(raw.index) ? raw.index! : 0, rate: typeof raw.rate === "number" ? raw.rate : 1 };
  } catch { return { index: 0, rate: 1 }; }
};
const store = (key: string, value: Saved) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* navigation privée : la reprise se perd, la lecture continue */ } };

/**
 * Écouter un cours : la synthèse vocale du navigateur, sans service extérieur. Lecture, pause, vitesse,
 * et reprise à l'endroit quitté (gardé sur cet appareil). Le passage lu est marqué dans le texte.
 */
export function CoursePodcast({ docId }: { docId: string }) {
  const key = `campuss-podcast:${docId}`;
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(1);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [supported, setSupported] = useState(true);
  const [french, setFrench] = useState(true);
  const elements = useRef<HTMLElement[]>([]);
  const voice = useRef<SpeechSynthesisVoice | undefined>(undefined);
  const run = useRef(0);
  const state = useRef({ index: 0, rate: 1, chunks: [] as Chunk[] });

  const mark = (block: number | null) => {
    document.querySelectorAll(".tts-current").forEach((el) => el.classList.remove("tts-current"));
    if (block === null) return;
    const el = elements.current[block];
    if (!el) return;
    el.classList.add("tts-current");
    const box = el.getBoundingClientRect();
    if (box.top < 80 || box.bottom > innerHeight - 160) el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  };

  const stop = () => { run.current++; speechSynthesis.cancel(); setPlaying(false); };

  const speak = (at: number) => {
    const list = state.current.chunks;
    const token = ++run.current;
    speechSynthesis.cancel();
    if (at >= list.length) {
      state.current.index = 0; setIndex(0); setPlaying(false); mark(null);
      store(key, { index: 0, rate: state.current.rate });
      return;
    }
    state.current.index = at; setIndex(at); setPlaying(true);
    store(key, { index: at, rate: state.current.rate });
    mark(list[at].block);
    const utterance = new SpeechSynthesisUtterance(list[at].text);
    utterance.lang = voice.current?.lang ?? "fr-FR";
    if (voice.current) utterance.voice = voice.current;
    utterance.rate = state.current.rate;
    utterance.onend = () => { if (token === run.current) speak(at + 1); };
    utterance.onerror = (event) => { if (token === run.current && event.error !== "interrupted" && event.error !== "canceled") { setPlaying(false); } };
    speechSynthesis.speak(utterance);
  };

  // Ouverture depuis la barre d'actions : on relit le cours tel qu'affiché et la position gardée
  useEffect(() => {
    const onOpen = () => {
      if (!("speechSynthesis" in window)) { setSupported(false); setOpen(true); return; }
      const course = readCourse();
      const saved = load(key);
      elements.current = course.elements;
      const at = saved.index < course.chunks.length ? saved.index : 0;
      state.current = { index: at, rate: saved.rate, chunks: course.chunks };
      setChunks(course.chunks); setIndex(at); setRate(saved.rate); setOpen(true);
    };
    addEventListener(OPEN_PODCAST, onOpen);
    return () => removeEventListener(OPEN_PODCAST, onOpen);
  }, [key]);

  // Les voix arrivent après le chargement de la page dans certains navigateurs
  useEffect(() => {
    if (!open || !("speechSynthesis" in window)) return;
    const choose = () => { voice.current = pickFrenchVoice(speechSynthesis.getVoices()); setFrench(Boolean(voice.current) || !speechSynthesis.getVoices().length); };
    choose();
    speechSynthesis.addEventListener("voiceschanged", choose);
    return () => speechSynthesis.removeEventListener("voiceschanged", choose);
  }, [open]);

  // Quitter la page coupe la voix
  useEffect(() => () => { run.current++; if ("speechSynthesis" in window) speechSynthesis.cancel(); mark(null); }, []);

  if (!open) return null;
  const close = () => { if (supported) stop(); mark(null); setOpen(false); };
  const changeRate = () => {
    const next = nextSpeed(state.current.rate);
    state.current.rate = next; setRate(next);
    store(key, { index: state.current.index, rate: next });
    if (playing) speak(state.current.index);
  };
  const go = (at: number) => { const target = Math.max(0, Math.min(chunks.length - 1, at)); if (playing) speak(target); else { state.current.index = target; setIndex(target); store(key, { index: target, rate }); mark(chunks[target]?.block ?? null); } };
  const percent = chunks.length ? Math.round((index / chunks.length) * 100) : 0;

  return (
    <div role="region" aria-label="Écouter le cours" data-podcast-open
      className="fixed inset-x-3 bottom-[calc(var(--bottom-offset)+0.5rem)] z-(--z-sticky) mx-auto max-w-md rounded-2xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-border md:inset-x-auto md:right-6 md:bottom-6 md:w-96 print:hidden">
      <div className="flex items-center gap-2">
        <Icon icon={IconListen} size={16} className="text-brand-text" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">Écouter le cours</p>
        {supported && chunks.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{percent} %</span>}
        <Button variant="ghost" size="icon-sm" aria-label="Fermer le lecteur" onClick={close}><Icon icon={IconClose} size={16} /></Button>
      </div>
      {!supported ? <p className="mt-2 text-sm text-muted-foreground">Ce navigateur ne sait pas lire à voix haute. Essaie avec Chrome, Edge ou Safari.</p>
        : !chunks.length ? <p className="mt-2 text-sm text-muted-foreground">Rien à lire dans ce cours.</p>
          : <>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Position dans le cours" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-(--dur-base)" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-2 flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Passage précédent" onClick={() => go(index - 1)} disabled={index === 0}><Icon icon={IconPrevious} /></Button>
              <Button size="icon" className="rounded-full" aria-label={playing ? "Pause" : index > 0 ? "Reprendre" : "Lecture"} onClick={() => (playing ? stop() : speak(index))}><Icon icon={playing ? IconPause : IconPlay} /></Button>
              <Button variant="ghost" size="icon" aria-label="Passage suivant" onClick={() => go(index + 1)} disabled={index >= chunks.length - 1}><Icon icon={IconNext} /></Button>
              <Button variant="outline" size="sm" className="ml-auto min-w-16 tabular-nums" aria-label={`Vitesse : ${rate.toLocaleString("fr-FR")} fois`} onClick={changeRate}>{rate.toLocaleString("fr-FR")}×</Button>
            </div>
            {!playing && index > 0 && <p className="mt-1 text-xs text-muted-foreground">Reprise là où tu t’étais arrêté</p>}
            {!french && <p className="mt-1 text-xs text-muted-foreground">Aucune voix française sur cet appareil : la voix par défaut lit le cours.</p>}
          </>}
    </div>
  );
}
