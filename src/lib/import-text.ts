import { CALLOUT_KINDS, type CalloutKind } from "./blocks";

const OBSIDIAN_CALLOUTS: Record<string, CalloutKind> = { note: "definition", info: "definition", abstract: "retenir", summary: "retenir", tldr: "retenir", tip: "retenir", important: "retenir", warning: "attention", caution: "attention", danger: "attention", example: "exemple" };

/** La syntaxe d'Obsidian devient du Markdown ordinaire, sans toucher aux blocs de code. */
export function obsidianToMarkdown(text: string) {
  const body = text.replace(/^\uFEFF/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  let fenced = false;
  return body.split(/\r?\n/).map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line;
    const callout = line.match(/^>\s*\[!(\w+)\][+-]?\s*(.*)$/);
    if (callout) {
      const kind = OBSIDIAN_CALLOUTS[callout[1].toLowerCase()] ?? "definition";
      return `> **${CALLOUT_KINDS[kind]} :** ${callout[2]}`;
    }
    return line
      .replace(/%%.*?%%/g, "")
      .replace(/!\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (_, name: string) => `![](<${name}>)`)
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/==([^=\n]+)==/g, (_, marked: string) => `:hl[${marked}]{c=yellow}`);
  }).join("\n");
}

// --- Fichiers Pages : une archive de messages protobuf compressés en Snappy, sans bibliothèque maintenue en JavaScript

function readVarint(data: Uint8Array, start: number): [number, number] {
  let value = 0, shift = 0, at = start;
  while (at < data.length) {
    const byte = data[at++];
    value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return [value, at];
    shift += 7;
    if (shift > 49) break;
  }
  throw new Error("nombre invalide");
}

const MAX_SNAPPY = 64 * 1024 * 1024;

export function snappyDecompress(input: Uint8Array): Uint8Array {
  const [length, begin] = readVarint(input, 0);
  if (length > MAX_SNAPPY) throw new Error("bloc trop grand");
  const out = new Uint8Array(length);
  let at = begin, pos = 0;
  while (at < input.length && pos < length) {
    const tag = input[at++];
    const kind = tag & 3;
    if (kind === 0) {
      let size = tag >> 2;
      if (size >= 60) { const bytes = size - 59; size = 0; for (let i = 0; i < bytes; i++) size += input[at + i] * 2 ** (8 * i); at += bytes; }
      size += 1;
      if (pos + size > length || at + size > input.length) throw new Error("bloc corrompu");
      out.set(input.subarray(at, at + size), pos);
      at += size; pos += size;
      continue;
    }
    let size: number, offset: number;
    if (kind === 1) { size = ((tag >> 2) & 7) + 4; offset = ((tag >> 5) << 8) | input[at++]; }
    else if (kind === 2) { size = (tag >> 2) + 1; offset = input[at] | (input[at + 1] << 8); at += 2; }
    else { size = (tag >> 2) + 1; offset = input[at] + input[at + 1] * 256 + input[at + 2] * 65536 + input[at + 3] * 16777216; at += 4; }
    if (!offset || offset > pos || pos + size > length) throw new Error("bloc corrompu");
    for (let i = 0; i < size; i++, pos++) out[pos] = out[pos - offset];
  }
  return out.subarray(0, pos);
}

/** Les champs d'un message protobuf, sans connaître son schéma. */
function fields(data: Uint8Array) {
  const out: { field: number; value: number | Uint8Array }[] = [];
  let at = 0;
  while (at < data.length) {
    const [key, next] = readVarint(data, at);
    at = next;
    const wire = key % 8, field = Math.floor(key / 8);
    if (wire === 0) { const [value, after] = readVarint(data, at); out.push({ field, value }); at = after; }
    else if (wire === 2) { const [size, after] = readVarint(data, at); if (after + size > data.length) throw new Error("champ tronqué"); out.push({ field, value: data.subarray(after, after + size) }); at = after + size; }
    else if (wire === 1) at += 8;
    else if (wire === 5) at += 4;
    else throw new Error("champ inconnu");
  }
  return out;
}

const TEXT_STORAGE = 2001;

/** Texte des zones de type « corps » d'un fichier .iwa. Les styles sont trop liés au modèle Apple pour être lus sûrement. */
export function textFromIwa(file: Uint8Array): string[] {
  const chunks: Uint8Array[] = [];
  let at = 0;
  while (at + 4 <= file.length) {
    if (file[at] !== 0) throw new Error("format inconnu");
    const size = file[at + 1] | (file[at + 2] << 8) | (file[at + 3] << 16);
    at += 4;
    chunks.push(snappyDecompress(file.subarray(at, at + size)));
    at += size;
  }
  const whole = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let fill = 0;
  for (const chunk of chunks) { whole.set(chunk, fill); fill += chunk.length; }
  const texts: string[] = [];
  at = 0;
  const decoder = new TextDecoder();
  while (at < whole.length) {
    const [infoSize, afterInfo] = readVarint(whole, at);
    const info = fields(whole.subarray(afterInfo, afterInfo + infoSize));
    at = afterInfo + infoSize;
    for (const message of info.filter((f) => f.field === 2 && f.value instanceof Uint8Array)) {
      const parts = fields(message.value as Uint8Array);
      const type = parts.find((p) => p.field === 1)?.value as number | undefined;
      const length = parts.find((p) => p.field === 3)?.value as number | undefined;
      if (typeof length !== "number") continue;
      if (type === TEXT_STORAGE) {
        const storage = fields(whole.subarray(at, at + length));
        const kind = storage.find((f) => f.field === 1)?.value;
        if (kind === undefined || kind === 0) for (const f of storage) if (f.field === 3 && f.value instanceof Uint8Array) texts.push(decoder.decode(f.value));
      }
      at += length;
    }
  }
  return texts;
}

/** En dessous, une page de PDF n'a pas de vrai texte : c'est une photo de page, à transcrire. */
export const SCAN_CHARS_PER_PAGE = 50;

/** L'étudiant n'a pas à savoir si son PDF est un scan : le texte extrait par page en décide. */
export function looksScanned(pages: string[]) {
  if (!pages.length) return true;
  const chars = pages.reduce((total, page) => total + page.replace(/\s+/g, "").length, 0);
  return chars / pages.length < SCAN_CHARS_PER_PAGE;
}
