"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { importCards } from "@/app/actions/card-import";
import { Notice } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { APKG_EXPLANATION, guessFormat, IMPORT_MAX_BYTES, IMPORT_MAX_CARDS, isZip, parseImport, type ImportFormat } from "@/lib/card-import";
import { IconFile, IconUpload } from "@/lib/icons";
import { CardText } from "./card-text";
import { PublishInvite } from "./publish-invite";

type Destination = { scope: string; title: string };
type FormatChoice = "auto" | ImportFormat;

const FORMATS: { value: FormatChoice; label: string }[] = [
  { value: "auto", label: "Détecter" },
  { value: "csv", label: "CSV / TSV" },
  { value: "anki", label: "Anki (texte)" },
  { value: "quizlet", label: "Quizlet" },
  { value: "json", label: "JSON" },
];
const DELIMITERS = [{ value: "auto", label: "Détecter" }, { value: "\t", label: "Tabulation" }, { value: ";", label: "Point-virgule" }, { value: ",", label: "Virgule" }];
const TERM_SEPARATORS = [{ value: "\t", label: "Tabulation" }, { value: ",", label: "Virgule" }, { value: "custom", label: "Autre" }];
const CARD_SEPARATORS = [{ value: "\n", label: "Retour à la ligne" }, { value: ";", label: "Point-virgule" }, { value: "custom", label: "Autre" }];
const FORMAT_NAMES: Record<ImportFormat, string> = { csv: "CSV / TSV", anki: "Anki, notes en texte", quizlet: "Quizlet", json: "JSON" };
const DELIMITER_NAMES: Record<string, string> = { "\t": "tabulation", ";": "point-virgule", ",": "virgule" };
const PREVIEW = 20;

const plural = (n: number, word: string) => `${n.toLocaleString("fr-FR")} ${word}${n > 1 ? "s" : ""}`;

function Choice<T extends string>({ label, value, items, onChange }: { label: string; value: T; items: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <ToggleGroup aria-label={label} value={[value]} onValueChange={(v: string[]) => { if (v[0]) onChange(v[0] as T); }} className="flex-wrap justify-start">
        {items.map((item) => <ToggleGroupItem key={item.value} value={item.value} variant="outline">{item.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  );
}

/**
 * Import de fiches : un fichier ou du texte collé, lu dans le navigateur, un aperçu avant d'importer,
 * puis le serveur revalide tout. Formats : CSV/TSV, Anki (notes en texte), Quizlet, JSON ; .apkg expliqué.
 */
export function CardImporter({ destinations, initial }: { destinations: Destination[]; initial: string }) {
  const [scope, setScope] = useState(initial);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<FormatChoice>("auto");
  const [delimiter, setDelimiter] = useState("auto");
  const [termSep, setTermSep] = useState("\t");
  const [cardSep, setCardSep] = useState("\n");
  const [customTerm, setCustomTerm] = useState(" - ");
  const [customCard, setCustomCard] = useState("\n\n");
  const [swap, setSwap] = useState(false);
  const [fileError, setFileError] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: string; scope: string } | { error: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const effective: ImportFormat = format === "auto" ? guessFormat(fileName, text) : format;
  const result = useMemo(() => {
    if (!text.trim()) return null;
    return parseImport(text, effective, {
      delimiter: delimiter === "auto" ? undefined : delimiter,
      quizlet: { term: termSep === "custom" ? customTerm : termSep, card: cardSep === "custom" ? customCard.replace(/\\n/g, "\n") : cardSep },
    });
  }, [text, effective, delimiter, termSep, cardSep, customTerm, customCard]);
  const cards = useMemo(() => (result ? result.cards.map((c) => (swap ? { front: c.back, back: c.front } : c)) : []), [result, swap]);

  const readFile = async (file: File | undefined) => {
    setFileError("");
    setOutcome(null);
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) { setFileError("Fichier trop lourd : 2 Mo au plus."); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isZip(bytes) || file.name.toLowerCase().endsWith(".apkg")) { setFileError(APKG_EXPLANATION); setText(""); setFileName(""); return; }
    setFileName(file.name);
    setText(new TextDecoder("utf-8").decode(bytes));
  };

  const submit = async () => {
    if (!cards.length || pending) return;
    setPending(true);
    const response = await importCards({ scope, cards }).catch(() => ({ error: "Connexion perdue, réessaie." }));
    setPending(false);
    setOutcome(response);
    if ("ok" in response) { setText(""); setFileName(""); if (fileRef.current) fileRef.current.value = ""; }
  };

  const destinationTitle = destinations.find((d) => d.scope === scope)?.title ?? "Fiches libres";
  return (
    <div className="grid gap-8 pb-28 md:pb-8">
      <section aria-labelledby="import-source" className="grid gap-4">
        <h2 id="import-source" className="heading">1. Le fichier</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Icon icon={IconUpload} size={16} />Choisir un fichier</Button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,.apkg,text/plain,text/csv,application/json" className="sr-only" aria-label="Fichier de fiches" onChange={(e) => void readFile(e.target.files?.[0])} />
          {fileName && <span className="flex min-w-0 items-center gap-1.5 text-sm"><Icon icon={IconFile} size={16} className="text-muted-foreground" /><span className="truncate">{fileName}</span></span>}
          <span className="text-sm text-muted-foreground">.csv, .tsv, .txt, .json · 2 Mo et {IMPORT_MAX_CARDS.toLocaleString("fr-FR")} fiches au plus</span>
        </div>
        {fileError && <Notice tone="error">{fileError}</Notice>}
        <div className="grid gap-1.5">
          <Label htmlFor="import-text">Ou colle le texte</Label>
          <Textarea id="import-text" rows={6} value={text} onChange={(e) => { setText(e.target.value); setFileName(""); setOutcome(null); }} placeholder={"Recto\tVerso\nCapitale de la France\tParis"} className="font-mono text-sm" spellCheck={false} />
        </div>
        <Choice label="Format" value={format} items={FORMATS} onChange={setFormat} />
        {effective === "csv" && <Choice label="Séparateur" value={delimiter} items={DELIMITERS} onChange={setDelimiter} />}
        {effective === "quizlet" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Choice label="Entre terme et définition" value={termSep} items={TERM_SEPARATORS} onChange={setTermSep} />
              {termSep === "custom" && <Input aria-label="Séparateur entre terme et définition" value={customTerm} onChange={(e) => setCustomTerm(e.target.value)} maxLength={10} />}
            </div>
            <div className="grid gap-2">
              <Choice label="Entre les fiches" value={cardSep} items={CARD_SEPARATORS} onChange={setCardSep} />
              {cardSep === "custom" && <Input aria-label="Séparateur entre les fiches (\n pour un retour à la ligne)" value={customCard} onChange={(e) => setCustomCard(e.target.value)} maxLength={10} />}
            </div>
          </div>
        )}
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">D’où exporter ses fiches</summary>
          <ul className="mt-2 grid list-disc gap-1.5 ps-5">
            <li><span className="font-semibold text-foreground">Anki</span> : Fichier › Exporter › « Notes in Plain Text (.txt) ». Les paquets .apkg ne sont pas lus directement.</li>
            <li><span className="font-semibold text-foreground">Quizlet</span> : sur la page du paquet, « … » › Exporter, puis copie le texte ici avec les mêmes séparateurs.</li>
            <li><span className="font-semibold text-foreground">Tableur</span> : deux colonnes (recto, verso), enregistrées en CSV ou TSV ; une ligne d’en-tête est reconnue.</li>
            <li><span className="font-semibold text-foreground">JSON</span> : <code className="rounded bg-muted px-1">{"{ \"cards\": [{ \"front\": \"…\", \"back\": \"…\" }] }"}</code> (ou le tableau seul ; recto/verso et question/answer aussi acceptés).</li>
          </ul>
        </details>
      </section>

      <section aria-labelledby="import-destination" className="grid gap-3">
        <h2 id="import-destination" className="heading">2. Le paquet</h2>
        <ToggleGroup aria-labelledby="import-destination" value={[scope]} onValueChange={(v: string[]) => { if (v[0]) setScope(v[0]); }} className="flex-wrap justify-start">
          {destinations.map((d) => <ToggleGroupItem key={d.scope} value={d.scope} variant="outline" className="max-w-full"><span className="truncate">{d.title}</span></ToggleGroupItem>)}
        </ToggleGroup>
      </section>

      <section aria-labelledby="import-preview" className="grid gap-3" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="import-preview" className="heading">3. Aperçu</h2>
          {result && result.cards.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setSwap((s) => !s)} aria-pressed={swap}>Inverser recto et verso</Button>}
        </div>
        {!result && <p className="text-sm text-muted-foreground">Choisis un fichier ou colle du texte : les fiches apparaissent ici avant d’être importées.</p>}
        {result?.error && <Notice tone="error">{result.error}</Notice>}
        {result && !result.error && (
          <>
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{plural(result.cards.length, "fiche")}</span>
              <span className="text-muted-foreground"> · {FORMAT_NAMES[result.format]}{result.delimiter && result.format === "csv" ? `, séparateur ${DELIMITER_NAMES[result.delimiter] ?? `« ${result.delimiter} »`}` : ""}</span>
            </p>
            {(result.empty > 0 || result.tooLong > 0 || result.truncated) && (
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {result.empty > 0 && <li>{plural(result.empty, "ligne")} sans recto ou sans verso, ignorée{result.empty > 1 ? "s" : ""}</li>}
                {result.tooLong > 0 && <li>{plural(result.tooLong, "fiche")} trop longue{result.tooLong > 1 ? "s" : ""} (1 000 caractères au recto, 2 000 au verso), ignorée{result.tooLong > 1 ? "s" : ""}</li>}
                {result.truncated && <li>Seules les {IMPORT_MAX_CARDS.toLocaleString("fr-FR")} premières fiches sont gardées</li>}
              </ul>
            )}
            {cards.length > 0 && (
              <ol className="grid gap-2">
                {cards.slice(0, PREVIEW).map((card, index) => (
                  <li key={index} className="grid gap-1 rounded-xl bg-card p-3 shadow-xs sm:grid-cols-2 sm:gap-4">
                    <CardText text={card.front} className="font-semibold" clamp />
                    <CardText text={card.back} className="text-muted-foreground" clamp />
                  </li>
                ))}
              </ol>
            )}
            {cards.length > PREVIEW && <p className="text-sm text-muted-foreground">… et {plural(cards.length - PREVIEW, "autre fiche")}</p>}
          </>
        )}
        {outcome && "error" in outcome && <Notice tone="error">{outcome.error}</Notice>}
        {outcome && "ok" in outcome && (
          <div className="grid gap-3">
            <Notice>{outcome.ok}</Notice>
            <div className="flex flex-wrap gap-2">
              <Link href={`/reviser/seance?mode=fiches&paquet=${outcome.scope}`} data-slot="button" className={buttonVariants()}>Réviser ces fiches</Link>
              <Link href={`/reviser/fiches?paquet=${outcome.scope}#mes-fiches`} data-slot="button" className={buttonVariants({ variant: "outline" })}>Voir le paquet</Link>
            </div>
            <PublishInvite scope={outcome.scope} primary={false} className="max-w-2xl" />
          </div>
        )}
        {cards.length > 0 && (
          <Button type="button" pending={pending} onClick={() => void submit()} className="justify-self-start">
            Importer {plural(cards.length, "fiche")} dans « {destinationTitle} »
          </Button>
        )}
      </section>
    </div>
  );
}
