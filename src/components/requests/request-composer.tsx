"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { createCourseRequest } from "@/app/actions/requests";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { REQUEST_MAX_CHARS } from "@/lib/course-request-rules";
import { IconError, IconExpand, IconSubjects } from "@/lib/icons";
import { guessSubject } from "@/lib/search-rules";
import { toast } from "@/lib/toast";

export type ComposerSubject = { id: number; name: string; shortName: string };

/**
 * « Quel cours te manque ? » sur une ligne. La matière se devine pendant la frappe et s'affiche en puce modifiable ;
 * sur la page d'une matière, elle est connue et la puce disparaît.
 */
export function RequestComposer({ subjects, subjectId, initialSubject, initialText = "", autoFocus, onSent, quiet }: {
  subjects: ComposerSubject[]; subjectId?: number; initialSubject?: number | null; initialText?: string; autoFocus?: boolean; onSent?: () => void;
  // Bouton en contour quand l'écran a déjà son action principale
  quiet?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  const [picked, setPicked] = useState<number | null>(initialSubject ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const guessed = useMemo(() => guessSubject(text, subjects, initialSubject), [text, subjects, initialSubject]);
  const chosen = subjectId ?? picked ?? guessed ?? subjects[0]?.id ?? null;
  const subject = subjects.find((s) => s.id === chosen);

  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length < 3) { setError("Écris ta demande en une ligne : quel cours cherches-tu ?"); input.current?.focus(); return; }
    if (!chosen) { setError("Choisis une matière"); return; }
    start(async () => {
      const result = await createCourseRequest(chosen, text);
      if (result.error) { setError(result.error); return; }
      setError(null);
      setText("");
      setPicked(null);
      toast(result.merged ? "Ta voix s’ajoute à une demande proche" : "Demande envoyée");
      onSent?.();
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-2 shadow-xs focus-within:ring-3 focus-within:ring-ring/30">
        <Input ref={input} aria-label="Ta demande" aria-invalid={Boolean(error) || undefined} value={text} maxLength={REQUEST_MAX_CHARS}
          onChange={(event) => { setText(event.target.value); if (error) setError(null); }}
          placeholder="Quel cours te manque ?" className="min-h-10 min-w-48 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent" />
        {!subjectId && subjects.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="max-w-56 rounded-full bg-brand-tint text-brand-text hover:bg-brand-tint" aria-label={`Matière : ${subject?.name ?? "à choisir"}`} />}>
              <Icon icon={IconSubjects} size={16} /><span className="truncate">{subject?.shortName || subject?.name || "Matière"}</span><Icon icon={IconExpand} size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-64">
              <DropdownMenuRadioGroup value={String(chosen ?? "")} onValueChange={(value) => setPicked(Number(value))}>
                {subjects.map((s) => <DropdownMenuRadioItem key={s.id} value={String(s.id)}>{s.name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button type="submit" variant={quiet ? "outline" : "default"} pending={pending}>Demander</Button>
      </div>
      {error && <p role="alert" className="flex items-center gap-1.5 px-2 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{error}</p>}
    </form>
  );
}
