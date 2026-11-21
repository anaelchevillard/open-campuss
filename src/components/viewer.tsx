"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { IconFullscreen } from "@/lib/icons";

const MAX_STORED = 1024 * 1024;

export function Viewer({ src, title, sandbox, popout = true, storageKey }: { src: string; title: string; sandbox?: string; popout?: boolean; storageKey?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Le stockage du contenu reste ici, par document, et lui est rendu par le nom de la fenêtre avant son premier script
  const [name, setName] = useState<string | null>(storageKey ? null : "");
  useEffect(() => {
    if (!storageKey) return;
    const key = `campuss-artefact:${storageKey}`;
    let stored = "{}";
    try { stored = localStorage.getItem(key) ?? "{}"; } catch { /* stockage indisponible */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(`campuss:${stored}`);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "campuss-storage") return;
      const text = JSON.stringify(event.data.data ?? {});
      if (text.length > MAX_STORED) return;
      try { localStorage.setItem(key, text); } catch { /* quota atteint */ }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [storageKey]);
  // Jamais de contenu masqué en attendant : l'iframe peut finir de charger avant l'activation de React,
  // et son événement load serait alors perdu. Le fond animé s'arrête de lui-même.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="mt-6">
      {popout && (
        <p className="mb-1.5 flex justify-end">
          <a className="press inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href={src} target="_blank" rel="noopener">
            <Icon icon={IconFullscreen} className="size-3.5" />Ouvrir en plein écran<span className="sr-only"> (nouvel onglet)</span>
          </a>
        </p>
      )}
      <div className={`overflow-hidden rounded-[0.45rem] border border-border ${settled ? "bg-card" : "frame-loading"}`}>
        {name !== null && <iframe ref={frame} src={src} name={name || undefined} sandbox={sandbox} title={title} referrerPolicy="no-referrer" onLoad={() => setSettled(true)} className="block h-[calc(100dvh-7rem)] min-h-96 w-full" />}
      </div>
    </div>
  );
}
