import { looksScanned } from "@/lib/import-text";

/** Une page à transcrire : l'image envoyée et sa vignette, toutes deux en data: (la CSP refuse blob:). */
export type PhotoPage = { id: number; image: string; thumb: string; name: string };

const MAX_SIDE = 2000;
const THUMB_SIDE = 240;
export const MAX_PAGES = 20;

let nextId = 0;

function draw(source: CanvasImageSource, width: number, height: number, side: number, quality: number) {
  const scale = Math.min(1, side / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d")!;
  // Fond blanc : une page transparente deviendrait noire en JPEG
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Réduit la photo dans le navigateur : envoi plus rapide, moins de quota. */
export async function photoPage(file: File, name = file.name): Promise<PhotoPage> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`Impossible de lire « ${file.name} ». Utilise une photo JPEG ou PNG (sur iPhone, règle l’appareil photo sur « Le plus compatible »).`);
  });
  const page = { id: nextId++, name, image: draw(bitmap, bitmap.width, bitmap.height, MAX_SIDE, 0.85), thumb: draw(bitmap, bitmap.width, bitmap.height, THUMB_SIDE, 0.6) };
  bitmap.close();
  return page;
}

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
export const isImage = (file: File) => file.type.startsWith("image/");

type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfPage = { getTextContent(): Promise<{ items: { str?: string }[] }>; getViewport(o: { scale: number }): { width: number; height: number }; render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }): { promise: Promise<void> } };

/**
 * PDF : texte d'abord. Moins de 50 caractères par page, c'est un scan, et ses pages deviennent des images à transcrire.
 * unpdf (déjà là pour le serveur) embarque un pdf.js sans worker : rien à ouvrir dans la CSP. Chargé à la demande.
 */
export async function readPdf(file: File): Promise<{ scanned: false } | { scanned: true; pages: PhotoPage[]; skipped: number }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer())) as unknown as PdfDocument;
  const texts: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    texts.push(content.items.map((item) => item.str ?? "").join(" "));
  }
  if (!looksScanned(texts)) return { scanned: false };
  const pages: PhotoPage[] = [];
  const count = Math.min(pdf.numPages, MAX_PAGES);
  for (let n = 1; n <= count; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, MAX_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    pages.push({ id: nextId++, name: `${file.name}, page ${n}`, image: canvas.toDataURL("image/jpeg", 0.85), thumb: draw(canvas, canvas.width, canvas.height, THUMB_SIDE, 0.6) });
  }
  return { scanned: true, pages, skipped: pdf.numPages - count };
}
