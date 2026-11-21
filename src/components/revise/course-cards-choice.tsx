"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { cn } from "cn";
import { addMemoCards, generateMemoCards } from "@/app/actions/memo";
import { Notice } from "@/components/action-form";
import { AiSurface } from "@/components/ai/ai-surface";
import { AiWorking } from "@/components/ai/ai-working";
import { Icon } from "@/components/icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconAiCards, IconChevronRight, IconEdit, IconFriends, IconUpload, type IconData } from "@/lib/icons";
import { NewCardForm } from "./card-editor";
import { CardText } from "./card-text";
import { PublishInvite } from "./publish-invite";
import { PUBLISH_MIN_CARDS } from "@/lib/memo-pack-rules";

type Card = { front: string; back: string };
type Choice = "ai" | "manual";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

function Option({ icon, title, description, selected, disabled, onSelect, href, ai }: {
  icon: IconData; title: string; description: string; selected?: boolean; disabled?: boolean; onSelect?: () => void; href?: string; ai?: boolean;
}) {
  const body = (
    <>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", ai ? "bg-brand-tint text-brand-text" : "bg-muted text-muted-foreground")}><Icon icon={icon} /></span>
      <span className="grid min-w-0 flex-1 gap-0.5 text-left">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-pretty text-muted-foreground">{description}</span>
      </span>
      <Icon icon={IconChevronRight} size={16} className="shrink-0 text-muted-foreground" />
    </>
  );
  const className = cn(
    "flex min-h-20 w-full items-center gap-4 rounded-xl bg-card p-4 shadow-xs ring-1 ring-transparent transition-[box-shadow,background-color] duration-(--dur-fast) hover-ok:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
    selected && "ring-2 ring-primary",
  );
  if (href) return <Link href={href} className={className}>{body}</Link>;
  return <button type="button" aria-expanded={selected} disabled={disabled} onClick={onSelect} className={className}>{body}</button>;
}

/** Les trois façons de faire des fiches pour un cours. */
export function CourseCardsChoice({ docId, aiCards, aiReady, others, hasMine, initial }: {
  docId: string; aiCards: Card[] | null; aiReady: boolean; others: number; hasMine: boolean; initial: Choice | null;
}) {
  const [choice, setChoice] = useState<Choice | null>(initial);
  const [cards, setCards] = useState<Card[] | null>(initial === "ai" ? aiCards : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [madeSome, setMadeSome] = useState(hasMine);
  const [addedNow, setAddedNow] = useState(0);
  const aiPossible = aiCards ? aiCards.length > 0 : aiReady;

  const pickAi = async () => {
    setChoice("ai");
    if (cards) return;
    if (aiCards) { setCards(aiCards); return; }
    setBusy(true);
    setError("");
    const result = await generateMemoCards(docId).catch(() => ({ error: "Campuss IA ne répond pas. Réessaie dans un instant." }));
    if ("error" in result) setError(result.error);
    else setCards(result.cards);
    setBusy(false);
  };
  const add = async (list: Card[]) => {
    const result = await addMemoCards(docId, list).catch(() => null);
    if (!result) { setError("Connexion perdue, réessaie."); return; }
    setAdded((all) => new Set([...all, ...list.map((c) => c.front)]));
    setMadeSome(true);
    setAddedNow((n) => n + result.added);
  };
  const onAdded = useCallback(() => { setMadeSome(true); setAddedNow((n) => n + 1); }, []);

  const review: ReactNode = madeSome && (
    <>
      {/* Un vrai lien (il mène à la séance) : avec Button et nativeButton={false}, il était annoncé comme un bouton */}
      <Link href={`/reviser/seance?mode=fiches&paquet=${docId}`} className={cn(buttonVariants({ variant: "outline" }), "justify-self-start")}>Réviser ces fiches</Link>
      {/* À la fin d'une création, l'invitation à publier (le serveur décide si elle a lieu d'être) */}
      {addedNow > 0 && <PublishInvite key={Math.min(addedNow, PUBLISH_MIN_CARDS)} scope={docId} primary={false} className="max-w-2xl" />}
    </>
  );

  return (
    <div className="grid gap-8">
      <div className="grid gap-3 md:grid-cols-3" role="group" aria-label="Comment faire tes fiches">
        <Option
          ai icon={IconAiCards} title="Générer avec Campuss IA" selected={choice === "ai"} disabled={!aiPossible} onSelect={() => void pickAi()}
          description={aiCards?.length ? `${plural(aiCards.length, "fiche")} déjà prête${aiCards.length > 1 ? "s" : ""} pour ce cours` : aiReady ? "Campuss IA les écrit à partir du cours" : "Campuss IA n’est pas disponible pour ce cours"}
        />
        <Option icon={IconEdit} title="Les faire moi-même" selected={choice === "manual"} onSelect={() => setChoice("manual")} description="Question et réponse, formules comprises ; le cours est déjà choisi" />
        <Option icon={IconFriends} title="Voir les fiches des autres élèves" href={`/reviser/fiches/paquets?cours=${docId}`} description={others ? `${plural(others, "paquet publié", "paquets publiés")} pour ce cours` : "Les paquets publics de ce cours, s’il y en a"} />
      </div>
      <Link href={`/reviser/fiches/importer?cours=${docId}`} className="-mt-4 inline-flex min-h-11 items-center gap-1.5 justify-self-start text-sm text-link hover:underline"><Icon icon={IconUpload} size={16} />Importer depuis Anki, Quizlet, un tableur ou du JSON</Link>

      {choice === "ai" && (
        <section aria-label="Fiches de Campuss IA" className="grid gap-4">
          {error && <Notice tone="error">{error}</Notice>}
          {busy && <AiWorking label="Campuss IA écrit tes fiches…" />}
          {cards && (
            <AiSurface>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{plural(cards.length, "fiche proposée", "fiches proposées")} · à vérifier</p>
                <Button size="sm" variant="outline" disabled={cards.every((c) => added.has(c.front))} onClick={() => void add(cards)}>Tout ajouter</Button>
              </div>
              <ul className="grid gap-2">
                {cards.map((card) => (
                  <li key={card.front} className="flex items-start justify-between gap-3 rounded-lg bg-card p-3 shadow-xs">
                    <span className="grid min-w-0 gap-1">
                      <CardText text={card.front} className="font-semibold" />
                      <CardText text={card.back} className="text-sm text-muted-foreground" />
                    </span>
                    <Button size="sm" variant="ghost" disabled={added.has(card.front)} onClick={() => void add([card])}>{added.has(card.front) ? "Ajoutée" : "Ajouter"}</Button>
                  </li>
                ))}
              </ul>
            </AiSurface>
          )}
          {review}
        </section>
      )}

      {choice === "manual" && (
        <section aria-label="Écrire mes fiches" className="grid gap-4">
          <NewCardForm course={docId} onAdded={onAdded} />
          {review}
        </section>
      )}
    </div>
  );
}
