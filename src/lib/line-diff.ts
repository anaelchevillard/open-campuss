/** Comparaisons pour relire une correction sans bibliothèque : ligne à ligne, puis au mot dans une ligne modifiée. */

export type DiffKind = "same" | "add" | "del";
export type DiffPart = { kind: DiffKind; text: string };

// Au-delà, la table de comparaison coûterait trop de mémoire
const MAX_CELLS = 4_000_000;

/** Plus longue sous-suite commune, déroulée en opérations. Renvoie null si les entrées sont trop longues. */
function diffSeq<T>(a: T[], b: T[]): { kind: DiffKind; item: T }[] | null {
  if (a.length * b.length > MAX_CELLS) return null;
  const table: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out: { kind: DiffKind; item: T }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push({ kind: "same", item: a[i] }); i++; j++; }
    else if (j < b.length && (i >= a.length || table[i][j + 1] >= table[i + 1][j])) { out.push({ kind: "add", item: b[j] }); j++; }
    else { out.push({ kind: "del", item: a[i] }); i++; }
  }
  return out;
}

export function lineDiff(before: string, after: string): { kind: DiffKind; text: string }[] {
  const ops = diffSeq(before.split("\n"), after.split("\n"));
  if (!ops) return [{ kind: "same", text: "Correction trop longue pour être comparée ici." }];
  return ops.map((op) => ({ kind: op.kind, text: op.item }));
}

/** Mots, espaces et ponctuation séparés : une virgule ajoutée ne marque pas tout le mot voisin. */
export const tokenize = (text: string) => text.match(/[\p{L}\p{N}’'_-]+|\s+|[^\s\p{L}\p{N}]/gu) ?? [];

/** Les morceaux voisins de même nature sont fusionnés. */
function merge(parts: DiffPart[]) {
  const out: DiffPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last && last.kind === part.kind) last.text += part.text;
    else out.push({ ...part });
  }
  return out;
}

export function wordDiff(before: string, after: string): DiffPart[] {
  const ops = diffSeq(tokenize(before), tokenize(after));
  if (!ops) return merge([{ kind: "del" as const, text: before }, { kind: "add" as const, text: after }].filter((p) => p.text));
  return merge(ops.map((op) => ({ kind: op.kind, text: op.item })));
}

/** Part du texte gardée entre deux versions d'une ligne, de 0 à 1. */
export function similarity(parts: DiffPart[]) {
  let same = 0;
  let total = 0;
  for (const part of parts) {
    const n = part.text.trim().length;
    total += n;
    if (part.kind === "same") same += n;
  }
  return total ? same / total : 1;
}

export type DiffBlock = { kind: DiffKind | "change"; parts: DiffPart[] };

/**
 * Bloc par bloc (une ligne de Markdown = un paragraphe, un titre, un élément de liste). Une ligne retirée suivie d'une ligne
 * ajoutée qui lui ressemble devient une seule ligne « modifiée », comparée au mot.
 */
export function blockDiff(before: string, after: string): DiffBlock[] {
  const ops = diffSeq(before.split("\n"), after.split("\n"));
  if (!ops) return [{ kind: "change", parts: wordDiff(before, after) }];
  const blocks: DiffBlock[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].kind === "same") { blocks.push({ kind: "same", parts: [{ kind: "same", text: ops[k].item }] }); k++; continue; }
    const dels: string[] = [];
    const adds: string[] = [];
    while (k < ops.length && ops[k].kind !== "same") { (ops[k].kind === "del" ? dels : adds).push(ops[k].item); k++; }
    const pairs = Math.max(dels.length, adds.length);
    for (let p = 0; p < pairs; p++) {
      const del = dels[p];
      const add = adds[p];
      if (del !== undefined && add !== undefined) {
        const parts = wordDiff(del, add);
        if (similarity(parts) >= 0.3) { blocks.push({ kind: "change", parts }); continue; }
      }
      if (del !== undefined) blocks.push({ kind: "del", parts: [{ kind: "del", text: del }] });
      if (add !== undefined) blocks.push({ kind: "add", parts: [{ kind: "add", text: add }] });
    }
  }
  // Les lignes vides ne disent rien : elles ne font que séparer des paragraphes
  return blocks.filter((b) => b.parts.some((p) => p.text.trim()));
}

export type DiffView = DiffBlock | { kind: "gap"; count: number };

/** « Changements seuls » : les blocs modifiés, un bloc de contexte autour, et le nombre de blocs sautés. */
export function onlyChanges(blocks: DiffBlock[], context = 1): DiffView[] {
  const keep = new Array<boolean>(blocks.length).fill(false);
  blocks.forEach((b, i) => {
    if (b.kind === "same") return;
    for (let c = Math.max(0, i - context); c <= Math.min(blocks.length - 1, i + context); c++) keep[c] = true;
  });
  const out: DiffView[] = [];
  let skipped = 0;
  blocks.forEach((b, i) => {
    if (keep[i]) {
      if (skipped) out.push({ kind: "gap", count: skipped });
      skipped = 0;
      out.push(b);
    } else skipped++;
  });
  if (skipped) out.push({ kind: "gap", count: skipped });
  return out;
}

/** Mots ajoutés et retirés, pour la ligne de la file. */
export function diffCounts(blocks: DiffBlock[]) {
  let added = 0;
  let removed = 0;
  for (const block of blocks) for (const part of block.parts) {
    const words = part.text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
    if (part.kind === "add") added += words;
    else if (part.kind === "del") removed += words;
  }
  return { added, removed };
}
