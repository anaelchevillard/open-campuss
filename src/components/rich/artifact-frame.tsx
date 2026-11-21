"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { IconFullscreen } from "@/lib/icons";
import { ARTIFACT_SANDBOX, DEFAULT_HEIGHT, heightFromMessage, type ArtifactDisplay } from "@/lib/rich/artifact";

/**
 * Un artefact HTML dans le cours. Cadre de l'origine de contenu, bac à sable sans same-origin :
 * aucun script de l'auteur ne tourne dans l'origine principale. La hauteur suit ce que la page annonce (bornée),
 * sauf en « page » (la page HTML du cours, à hauteur d'écran). Plein écran sur le cadre, et repli lisible à l'impression.
 */
export function ArtifactFrame({ src, title, display = "bloc" }: { src: string | null; title: string; display?: ArtifactDisplay }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  useEffect(() => {
    if (display === "page") return;
    const onMessage = (event: MessageEvent) => {
      // Seul le cadre de cet artefact parle de sa hauteur ; un autre message ou une autre fenêtre est ignoré
      if (event.source !== frame.current?.contentWindow) return;
      const next = heightFromMessage(event.data);
      if (next !== null) setHeight(next);
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [display]);
  const fullscreen = () => { void box.current?.requestFullscreen?.().catch(() => undefined); };
  return (
    <figure className="course-artifact not-prose my-6 grid gap-1.5" aria-label={`Artefact : ${title}`}>
      <figcaption className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {src && <button type="button" onClick={fullscreen} className="press inline-flex min-h-8 items-center gap-1.5 hover:text-foreground coarse:min-h-11"><Icon icon={IconFullscreen} className="size-3.5" />Plein écran</button>}
      </figcaption>
      <div ref={box} className="overflow-hidden rounded-[0.45rem] border border-border bg-card print:hidden">
        {src
          ? <iframe ref={frame} src={src} title={title} sandbox={ARTIFACT_SANDBOX} referrerPolicy="no-referrer" loading="lazy"
            style={display === "page" ? undefined : { height }} className={display === "page" ? "block h-[calc(100dvh-7rem)] min-h-96 w-full" : "block w-full"} />
          : <p className="p-4 text-sm text-muted-foreground">Artefact indisponible ici.</p>}
      </div>
      {/* Le PDF officiel et l'impression n'exécutent rien : un repli statique, lisible */}
      <p className="hidden rounded-md border border-dashed border-border p-3 text-sm print:block">{`Contenu interactif « ${title} » : à ouvrir sur Campuss, dans la version en ligne du cours.`}</p>
    </figure>
  );
}
