/**
 * Graphe de fonctions. Parseur d'expressions maison, par descente récursive : la formule devient un
 * arbre évalué par de simples fonctions JavaScript, jamais par eval() ni new Function(). Seuls existent les nombres,
 * la variable x, les constantes pi et e, + − × ÷ ^, les parenthèses et une liste fermée de fonctions.
 *
 * Format du bloc (éditeur et Markdown, bloc de code « plot ») :
 *   y = sin(x)
 *   y = x^2/4 - 1
 *   x: -6 .. 6
 *   y: -3 .. 3
 * Une fonction par ligne (« y = », « f(x) = » ou l'expression seule), 6 au plus ; « x: » et « y: » bornent la vue.
 */
export const MAX_PLOT_CHARS = 2000;
export const MAX_FUNCTIONS = 6;
const MAX_EXPRESSION = 200;
const MAX_DEPTH = 40;

type Fn = (x: number) => number;
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max,
};
const ARITY: Record<string, number> = { min: 2, max: 2 };
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = { kind: "num"; value: number } | { kind: "id"; value: string } | { kind: "op"; value: string };

export class PlotError extends Error {}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const source = text.replace(/π/g, "pi").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-").replace(/,(?=\d)/g, ".");
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    const number = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(source.slice(i));
    if (number) { tokens.push({ kind: "num", value: Number(number[0]) }); i += number[0].length; continue; }
    const word = /^[a-z][a-z0-9]*/i.exec(source.slice(i));
    if (word) { tokens.push({ kind: "id", value: word[0].toLowerCase() }); i += word[0].length; continue; }
    if ("+-*/^(),".includes(c)) { tokens.push({ kind: "op", value: c }); i++; continue; }
    throw new PlotError(`Caractère inattendu : « ${c} »`);
  }
  return tokens;
}

/** Compile une expression en fonction de x ; lève PlotError si elle sort de la grammaire. */
export function compileExpression(text: string): Fn {
  if (text.length > MAX_EXPRESSION) throw new PlotError("Expression trop longue.");
  const tokens = tokenize(text);
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos];
  const isOp = (value: string) => peek()?.kind === "op" && peek()!.value === value;
  const expect = (value: string) => { if (!isOp(value)) throw new PlotError(`« ${value} » attendu`); pos++; };
  const nest = <T>(run: () => T): T => { if (++depth > MAX_DEPTH) throw new PlotError("Expression trop imbriquée."); try { return run(); } finally { depth--; } };

  // somme := produit (('+'|'-') produit)*
  const sum = (): Fn => nest(() => {
    let left = product();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value; const a = left; const b = product();
      left = op === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  });
  // produit := unaire (('*'|'/'|implicite) unaire)*
  const product = (): Fn => {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = tokens[pos++].value; const a = left; const b = unary();
        left = op === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (peek() && (peek()!.kind === "id" || isOp("(") || peek()!.kind === "num")) {
        const a = left; const b = unary(); // 2x, 3(x+1), x sin(x)
        left = (x) => a(x) * b(x);
      } else return left;
    }
  };
  const unary = (): Fn => {
    if (isOp("-")) { pos++; const a = unary(); return (x) => -a(x); }
    if (isOp("+")) { pos++; return unary(); }
    return power();
  };
  // puissance, associative à droite : 2^3^2 = 2^9
  const power = (): Fn => {
    const base = atom();
    if (!isOp("^")) return base;
    pos++;
    const exponent = nest(unary);
    return (x) => Math.pow(base(x), exponent(x));
  };
  const atom = (): Fn => {
    const token = peek();
    if (!token) throw new PlotError("Expression incomplète.");
    pos++;
    if (token.kind === "num") { const v = token.value; return () => v; }
    if (token.kind === "op" && token.value === "(") { const inner = sum(); expect(")"); return inner; }
    if (token.kind === "id") {
      if (token.value === "x") return (x) => x;
      if (Object.hasOwn(CONSTANTS, token.value)) { const v = CONSTANTS[token.value]; return () => v; }
      if (Object.hasOwn(FUNCTIONS, token.value)) {
        const fn = FUNCTIONS[token.value];
        expect("(");
        const args = [sum()];
        while (isOp(",")) { pos++; args.push(sum()); }
        expect(")");
        if (args.length !== (ARITY[token.value] ?? 1)) throw new PlotError(`« ${token.value} » attend ${ARITY[token.value] ?? 1} argument(s).`);
        return args.length === 1 ? (x) => fn(args[0](x)) : (x) => fn(args[0](x), args[1](x));
      }
      throw new PlotError(`Inconnu : « ${token.value} ». Variable x, constantes pi et e, fonctions ${Object.keys(FUNCTIONS).join(", ")}.`);
    }
    throw new PlotError(`« ${token.value} » inattendu`);
  };
  if (!tokens.length) throw new PlotError("Expression vide.");
  const fn = sum();
  if (pos < tokens.length) throw new PlotError(`« ${(tokens[pos] as Token).value} » inattendu`);
  return (x) => { const y = fn(x); return Number.isFinite(y) ? y : NaN; };
}

export type PlotSpec = { functions: { label: string; fn: Fn }[]; x: [number, number]; y: [number, number] };
export type PlotParse = { ok: true; spec: PlotSpec } | { ok: false; error: string };

const RANGE = /^([xy])\s*:\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)\s*$/i;

export function parsePlot(source: string): PlotParse {
  if (source.length > MAX_PLOT_CHARS) return { ok: false, error: "Bloc trop long." };
  const functions: PlotSpec["functions"] = [];
  let x: [number, number] = [-6, 6];
  let y: [number, number] = [-4, 4];
  try {
    for (const raw of source.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("%")) continue;
      const range = RANGE.exec(line);
      if (range) {
        const [lo, hi] = [Number(range[2]), Number(range[3])];
        if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi && hi - lo <= 1e6)) throw new PlotError(`Intervalle invalide : ${line}`);
        if (range[1].toLowerCase() === "x") x = [lo, hi]; else y = [lo, hi];
        continue;
      }
      const label = line.replace(/^(y|f\s*\(\s*x\s*\))\s*=\s*/i, "");
      if (functions.length >= MAX_FUNCTIONS) throw new PlotError(`${MAX_FUNCTIONS} fonctions au plus.`);
      functions.push({ label, fn: compileExpression(label) });
    }
  } catch (error) {
    if (error instanceof PlotError) return { ok: false, error: error.message };
    throw error;
  }
  if (!functions.length) return { ok: false, error: "Écris au moins une fonction, par exemple « y = sin(x) »." };
  return { ok: true, spec: { functions, x, y } };
}

/** Points d'une courbe, pour le repli statique (impression, PDF) : coupée là où la fonction n'est pas définie. */
export function samplePath(fn: Fn, [x0, x1]: [number, number], [y0, y1]: [number, number], steps = 400) {
  const parts: string[] = [];
  let open = false;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = fn(x);
    if (!Number.isFinite(y) || y < y0 - (y1 - y0) * 4 || y > y1 + (y1 - y0) * 4) { open = false; continue; }
    parts.push(`${open ? "L" : "M"}${x.toFixed(4)} ${(-y).toFixed(4)}`);
    open = true;
  }
  return parts.join(" ");
}
