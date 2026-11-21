import "server-only";
import sharp from "sharp";
import { sniffInline } from "./content-utils";

// Le serveur a 768 Mo : 50 Mpx couvrent les photos de téléphone, pas les bombes d'image
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_SIDE = 2400;
const QUALITY = 85;

sharp.cache(false);

export class ImageRejected extends Error {}

export type CleanedImage = { buffer: Buffer; inlineType: string };
type Options = { format?: "jpeg"; maxSide?: number };

// Une seule image à la fois : plusieurs grandes photos décodées ensemble dépasseraient la mémoire du conteneur
let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => undefined);
  return run;
}

async function reencode(input: Buffer, type: string, { format, maxSide = MAX_SIDE }: Options): Promise<CleanedImage> {
  const read = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" as const };
  const info = await sharp(input, read).metadata();
  const animated = !format && (info.pages ?? 1) > 1;
  const inside = { width: maxSide, height: maxSide, fit: "inside" as const, withoutEnlargement: true };
  // Sans withMetadata, sharp n'écrit ni EXIF, ni XMP, ni IPTC. rotate() applique l'orientation avant qu'elle disparaisse.
  const image = (animated ? sharp(input, { ...read, animated: true }) : sharp(input, read).rotate()).resize(inside);
  if (format === "jpeg") return { buffer: await image.flatten({ background: "#ffffff" }).jpeg({ quality: QUALITY }).toBuffer(), inlineType: "image/jpeg" };
  if (type === "image/gif") return { buffer: await image.gif().toBuffer(), inlineType: "image/gif" };
  if (animated) return { buffer: await image.webp({ quality: QUALITY }).toBuffer(), inlineType: "image/webp" };
  if (info.hasAlpha && !(await sharp(input, read).stats()).isOpaque) return { buffer: await image.png().toBuffer(), inlineType: "image/png" };
  if (type === "image/jpeg") return { buffer: await image.jpeg({ quality: QUALITY }).toBuffer(), inlineType: "image/jpeg" };
  // PNG opaque : souvent une capture ou un schéma, que le JPEG baverait autour du texte
  return { buffer: await image.webp({ quality: QUALITY + 5 }).toBuffer(), inlineType: "image/webp" };
}

/**
 * Réencode une image reçue : plus aucune métadonnée, et ce qui n'est pas une vraie image s'arrête ici.
 * La signature passe avant sharp, qui saurait sinon lire du SVG et d'autres formats qu'on n'accepte pas.
 */
export async function cleanImage(input: Buffer, options: Options = {}): Promise<CleanedImage> {
  const type = sniffInline(input.subarray(0, 16));
  if (!type?.startsWith("image/")) throw new ImageRejected("Ce fichier n’est pas une image lisible.");
  try {
    return await oneAtATime(() => reencode(input, type, options));
  } catch (error) {
    console.warn("image refusée :", (error as Error).message);
    throw new ImageRejected("Cette image est illisible ou trop grande.");
  }
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

/** Le réencodage peut changer le format : le nom téléchargé doit rester vrai. */
export function nameForType(filename: string, inlineType: string) {
  const extension = EXTENSIONS[inlineType];
  if (!extension) return filename;
  if (inlineType === "image/jpeg" && /\.jpe?g$/i.test(filename)) return filename;
  const dot = filename.lastIndexOf(".");
  return (dot > 0 ? filename.slice(0, dot) : filename) + extension;
}
