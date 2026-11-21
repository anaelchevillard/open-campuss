/**
 * Mise en forme légère d'un côté de fiche : on entoure ou préfixe la sélection d'un champ texte.
 * Logique pure, testée dans tests/fiches-import.test.ts. Le texte reste du Markdown restreint (lib/card-text.ts).
 */

export type FormatKind = "bold" | "italic" | "list" | "math" | "mathBlock";
export type Edit = { value: string; start: number; end: number };

const WRAP: Record<"bold" | "italic" | "math", [string, string, string]> = {
  bold: ["**", "**", "texte en gras"],
  italic: ["*", "*", "texte en italique"],
  math: ["$", "$", "x^2"],
};

/** Applique une mise en forme à la sélection [start, end[ ; la sélection rendue couvre le texte mis en forme. */
export function applyFormat(value: string, start: number, end: number, kind: FormatKind): Edit {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  const selected = value.slice(from, to);
  if (kind === "list") {
    const lineStart = value.lastIndexOf("\n", from - 1) + 1;
    const block = value.slice(lineStart, to);
    const lines = block.split("\n");
    const listed = lines.every((line) => /^- /.test(line));
    const next = lines.map((line) => (listed ? line.replace(/^- /, "") : `- ${line}`)).join("\n");
    return { value: value.slice(0, lineStart) + next + value.slice(to), start: lineStart, end: lineStart + next.length };
  }
  if (kind === "mathBlock") {
    const inner = selected || "\\frac{a}{b}";
    const before = from > 0 && value[from - 1] !== "\n" ? "\n" : "";
    const text = `${before}$$\n${inner}\n$$\n`;
    const innerStart = from + before.length + 3;
    return { value: value.slice(0, from) + text + value.slice(to), start: innerStart, end: innerStart + inner.length };
  }
  const [open, close, placeholder] = WRAP[kind];
  // Déjà entouré : on retire la mise en forme (bascule, comme Ctrl+B dans un traitement de texte)
  if (value.slice(from - open.length, from) === open && value.slice(to, to + close.length) === close && (kind !== "italic" || value[from - 2] !== "*")) {
    return { value: value.slice(0, from - open.length) + selected + value.slice(to + close.length), start: from - open.length, end: to - open.length };
  }
  const inner = selected || placeholder;
  return { value: value.slice(0, from) + open + inner + close + value.slice(to), start: from + open.length, end: from + open.length + inner.length };
}

/** Insère un texte à la place de la sélection ; le curseur se place après. */
export function insertAt(value: string, start: number, end: number, text: string): Edit {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  const at = from + text.length;
  return { value: value.slice(0, from) + text + value.slice(to), start: at, end: at };
}
