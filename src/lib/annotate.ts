/** Les calculs des annotations, sans navigateur : retrouver un passage et poser ou retirer une marque. */
export const MARK_KINDS = ["hl", "bold", "italic", "underline", "strike"] as const;
export type MarkKind = typeof MARK_KINDS[number];
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;
export type HighlightColor = typeof HIGHLIGHT_COLORS[number];

export type Anchor = { start: number; end: number; quote: string; prefix: string; suffix: string };
export type Span = { start: number; end: number };
export type Mark = Anchor & { id: string; kind: string; color: string | null };

export const MAX_ANNOTATIONS_PER_SPACE = 5000;
/** À 90 %, l'interface prévient : mieux vaut trier avant d'être bloqué en pleine révision. */
export const annotationsNearLimit = (count: number) => count >= MAX_ANNOTATIONS_PER_SPACE * 0.9;

const CONTEXT = 32;

export function anchorOf(text: string, start: number, end: number): Anchor {
  return { start, end, quote: text.slice(start, end), prefix: text.slice(Math.max(0, start - CONTEXT), start), suffix: text.slice(end, end + CONTEXT) };
}

function occurrences(text: string, needle: string) {
  const found: number[] = [];
  for (let at = text.indexOf(needle); at >= 0 && found.length < 200; at = text.indexOf(needle, at + 1)) found.push(at);
  return found;
}

/** Le cours peut changer après coup : la position sert d'indice, la citation et son contexte tranchent. */
export function locate(text: string, anchor: Pick<Anchor, "start" | "end" | "quote" | "prefix" | "suffix">): Span | null {
  const { quote, start, prefix, suffix } = anchor;
  if (!quote) return null;
  if (start >= 0 && text.slice(start, start + quote.length) === quote) return { start, end: start + quote.length };
  const candidates = occurrences(text, quote);
  if (!candidates.length) return null;
  const score = (at: number) => {
    const before = text.slice(Math.max(0, at - prefix.length), at);
    const after = text.slice(at + quote.length, at + quote.length + suffix.length);
    return (prefix && before === prefix ? 2 : 0) + (suffix && after === suffix ? 2 : 0) - (start >= 0 ? Math.abs(at - start) / (text.length + 1) : 0);
  };
  const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { start: best, end: best + quote.length };
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

function subtract(from: Span, range: Span): Span[] {
  const pieces: Span[] = [];
  if (from.start < range.start) pieces.push({ start: from.start, end: range.start });
  if (range.end < from.end) pieces.push({ start: range.end, end: from.end });
  return pieces;
}

function isCovered(range: Span, spans: Span[]) {
  let at = range.start;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start > at) return false;
    at = Math.max(at, span.end);
    if (at >= range.end) return true;
  }
  return false;
}

export type MarkPlan = { remove: string[]; add: { kind: MarkKind; color: string | null; span: Span }[] };

/** Bascule façon traitement de texte : déjà tout marqué, on retire ; sinon on étend. Un point n'a qu'une couleur à la fois. */
export function planToggle(marks: (Mark & Span)[], kind: MarkKind, color: string | null, range: Span): MarkPlan {
  const plan: MarkPlan = { remove: [], add: [] };
  const same = marks.filter((m) => m.kind === kind && (kind !== "hl" || m.color === color));
  if (isCovered(range, same)) {
    for (const mark of same.filter((m) => overlaps(m, range))) {
      plan.remove.push(mark.id);
      for (const span of subtract(mark, range)) plan.add.push({ kind, color: mark.color, span });
    }
    return plan;
  }
  const merged = { ...range };
  for (const mark of same.filter((m) => m.start <= range.end && range.start <= m.end)) {
    plan.remove.push(mark.id);
    merged.start = Math.min(merged.start, mark.start);
    merged.end = Math.max(merged.end, mark.end);
  }
  plan.add.push({ kind, color, span: merged });
  if (kind === "hl") {
    for (const mark of marks.filter((m) => m.kind === "hl" && m.color !== color && overlaps(m, range))) {
      plan.remove.push(mark.id);
      for (const span of subtract(mark, range)) plan.add.push({ kind: "hl", color: mark.color, span });
    }
  }
  return plan;
}

/** « Effacer » : retire toutes les marques du passage, jamais les notes. */
export function planClear(marks: (Mark & Span)[], range: Span): MarkPlan {
  const plan: MarkPlan = { remove: [], add: [] };
  for (const mark of marks.filter((m) => m.kind !== "note" && overlaps(m, range))) {
    plan.remove.push(mark.id);
    for (const span of subtract(mark, range)) plan.add.push({ kind: mark.kind as MarkKind, color: mark.color, span });
  }
  return plan;
}

/** Découpe le texte en tronçons : chacun porte la liste des annotations actives à cet endroit. */
export function segments(spans: (Span & { id: string })[]) {
  const cuts = [...new Set(spans.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
  const out: (Span & { ids: string[] })[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const piece = { start: cuts[i], end: cuts[i + 1] };
    const ids = spans.filter((s) => s.start <= piece.start && piece.end <= s.end).map((s) => s.id);
    if (ids.length) out.push({ ...piece, ids });
  }
  return out;
}
