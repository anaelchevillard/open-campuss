"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import {
  checkImageFile, checkImageSize, clampCrop, cropRect, IMAGE_RULES, initialCrop, maxZoom, needsCrop, outputSize, panCrop, zoomCrop,
  type Crop, type ImageKind, type Rect,
} from "@/lib/image-crop";
import { IconAdd, IconUiMinusSign } from "@/lib/icons";

type Source = { bitmap: ImageBitmap; width: number; height: number };

/** Lecture locale (aucun envoi) : l'orientation de l'appareil photo est appliquée par le navigateur. */
async function readImage(file: Blob): Promise<Source> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

/** Le recadrage, réduit à la taille d'envoi, en JPEG (plus de position GPS : le serveur réencode de toute façon). */
async function renderImage({ bitmap }: Source, rect: Rect, kind: ImageKind): Promise<Blob> {
  const size = outputSize(rect, kind);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Ton navigateur n’a pas pu préparer l’image");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("Ton navigateur n’a pas pu préparer l’image");
  return blob;
}

/**
 * Choix d'une image de profil : refus immédiat d'un mauvais fichier (type, poids, puis dimensions après lecture locale),
 * recadrage proposé si le ratio n'est pas le bon, puis `onReady` avec l'image prête à envoyer (ou à prévisualiser).
 */
export function useImagePick(kind: ImageKind, onReady: (image: Blob) => void | Promise<void>) {
  const [error, setError] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const close = useCallback(() => setSource((current) => { current?.bitmap.close(); return null; }), []);

  async function pick(file: File) {
    setError("");
    const refused = checkImageFile(file);
    if (refused) return setError(refused);
    let image: Source;
    try { image = await readImage(file); } catch { return setError("Cette image n’a pas pu être lue. Utilise un JPEG, un PNG ou un WebP."); }
    const small = checkImageSize(image.width, image.height, kind);
    if (small) { image.bitmap.close(); return setError(small); }
    if (needsCrop(image.width, image.height, kind)) return setSource(image);
    await finish(image, cropRect(initialCrop(image.width, image.height), image.width, image.height, kind));
  }

  async function finish(image: Source, rect: Rect) {
    try {
      const blob = await renderImage(image, rect, kind);
      await onReady(blob);
    } catch (problem) {
      setError((problem as Error).message || "L’image n’a pas pu être préparée");
    } finally {
      image.bitmap.close();
      setSource(null);
    }
  }

  const dialog = (
    <ImageCropDialog source={source} kind={kind} onCancel={close}
      onConfirm={(rect) => { if (source) void finish(source, rect); }} />
  );
  return { pick, error, setError, dialog };
}

const STEP = 12;

/**
 * Recadrage façon Instagram : glisser pour déplacer, pincer, molette ou curseur pour zoomer.
 * Au clavier : flèches pour déplacer (Maj : plus loin), + et − pour zoomer. Rendu dans un canvas, rien n'est envoyé ici.
 */
export function ImageCropDialog({ source, kind, onCancel, onConfirm }: { source: Source | null; kind: ImageKind; onCancel: () => void; onConfirm: (rect: Rect) => void }) {
  const rule = IMAGE_RULES[kind];
  return (
    <ResponsiveSheet open={Boolean(source)} onOpenChange={(open) => { if (!open) onCancel(); }} size="lg"
      title={kind === "avatar" ? "Recadrer la photo" : "Recadrer la bannière"}
      description={`${rule.label} n’a pas le bon format : choisis la partie à garder.`}>
      {source && <Cropper key={`${source.width}x${source.height}`} source={source} kind={kind} onCancel={onCancel} onConfirm={onConfirm} />}
    </ResponsiveSheet>
  );
}

function Cropper({ source, kind, onCancel, onConfirm }: { source: Source; kind: ImageKind; onCancel: () => void; onConfirm: (rect: Rect) => void }) {
  const { width, height } = source;
  const [crop, setCrop] = useState<Crop>(() => initialCrop(width, height));
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const top = maxZoom(width, height, kind);
  const ratio = IMAGE_RULES[kind].ratio;

  // Dessin : le rectangle découpé remplit le cadre, à la densité de l'écran
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const box = element.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(box.width * dpr));
      element.height = Math.max(1, Math.round(box.height * dpr));
      const rect = cropRect(crop, width, height, kind);
      const context = element.getContext("2d");
      context?.drawImage(source.bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, element.width, element.height);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [crop, source, width, height, kind]);

  // Molette : écouteur non passif pour garder la page immobile pendant le zoom
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setCrop((current) => zoomCrop(current, current.zoom * Math.exp(-event.deltaY * 0.002), width, height, kind));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [width, height, kind]);

  const viewWidth = () => frame.current?.getBoundingClientRect().width || 1;
  const spread = () => { const [a, b] = [...pointers.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: spread(), zoom: crop.zoom };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const before = pointers.current.get(event.pointerId);
    if (!before) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const start = pinch.current;
      setCrop((current) => zoomCrop(current, start.zoom * (spread() / start.distance), width, height, kind));
      return;
    }
    const dx = event.clientX - before.x, dy = event.clientY - before.y;
    setCrop((current) => panCrop(current, dx, dy, viewWidth(), width, height, kind));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const zoomBy = (factor: number) => setCrop((current) => zoomCrop(current, current.zoom * factor, width, height, kind));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? STEP * 4 : STEP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setCrop((current) => panCrop(current, dx, dy, viewWidth(), width, height, kind));
    } else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomBy(1.15); }
    else if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomBy(1 / 1.15); }
  };

  return (
    <div className="grid gap-4 pb-2">
      <div ref={frame} tabIndex={0} role="group" aria-roledescription="recadrage"
        aria-label="Cadre de l’image. Glisse pour déplacer, pince pour zoomer. Au clavier : flèches pour déplacer, plus et moins pour zoomer."
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}
        className="relative cursor-grab touch-none justify-self-center overflow-hidden rounded-lg bg-muted select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
        // Toute la largeur, sans dépasser 60 % de la hauteur de l'écran (photo carrée sur ordinateur)
        style={{ aspectRatio: String(ratio), width: `min(100%, ${60 * ratio}vh)` }}>
        <canvas ref={canvas} aria-hidden className="block size-full" />
        {/* Photo : le rond qu'on verra partout, le reste voilé */}
        {kind === "avatar" && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(0_0_0/0.45)] ring-2 ring-white/80" />}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Dézoomer" disabled={crop.zoom <= 1} onClick={() => zoomBy(1 / 1.25)}><Icon icon={IconUiMinusSign} size={16} /></Button>
        <input type="range" aria-label="Zoom" min={1} max={top} step={0.01} value={crop.zoom} disabled={top <= 1}
          onChange={(event) => setCrop((current) => zoomCrop(current, Number(event.target.value), width, height, kind))}
          className="h-11 min-w-0 flex-1 accent-(--brand-text) fine:h-9" />
        <Button variant="ghost" size="icon" aria-label="Zoomer" disabled={crop.zoom >= top} onClick={() => zoomBy(1.25)}><Icon icon={IconAdd} size={16} /></Button>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => onConfirm(cropRect(clampCrop(crop, width, height, kind), width, height, kind))}>Valider le cadrage</Button>
      </div>
    </div>
  );
}
