"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { selectClass } from "@/components/field";
import { Icon } from "@/components/icon";
import { IconExpand, IconLocked } from "@/lib/icons";

export type PickableSubject = { id: number; name: string; level: number; semester?: number | null };

/** Parité d'un semestre absolu (S1, S3, S5 → 1) ; une matière annuelle (null) vaut pour les deux. */
const parityOf = (semester: number) => (semester % 2 === 1 ? 1 : 2);
/** Semestre absolu d'une année et d'une parité : L2 + 2e semestre → S4. */
export const absoluteSemester = (level: number, parity: 1 | 2) => 2 * level - 2 + parity;

/** Les matières d'une année et d'un semestre, la matière déjà choisie toujours comprise. */
export function subjectsOfTerm<T extends PickableSubject>(subjects: T[], level: number, parity: 1 | 2, keep?: number | null) {
  return subjects.filter((s) => s.id === keep || (s.level === level && (s.semester == null || parityOf(s.semester) === parity)));
}

type Term = { level: number; parity: 1 | 2 };

/** L'année et le semestre affichés au départ : ceux de la matière choisie, sinon l'année fixée ou préférée. */
export function initialTerm(subjects: PickableSubject[], value: number | null | undefined, { level, lockedLevel, semester }: { level?: number; lockedLevel?: number | null; semester?: number | null } = {}): Term {
  const chosen = subjects.find((s) => s.id === value);
  const termSemester = chosen?.semester ?? semester ?? null;
  const parity = termSemester ? parityOf(termSemester) : 1;
  if (lockedLevel) return { level: lockedLevel, parity };
  if (chosen) return { level: chosen.level, parity };
  const levels = [...new Set(subjects.map((s) => s.level))].sort();
  return { level: level && levels.includes(level) ? level : levels[0] ?? 1, parity };
}

type Slot = { key: "level" | "parity" | "subject"; label: ReactNode; control: ReactNode; locked?: boolean; missing?: boolean; empty?: boolean };

/**
 * Choisir une matière en trois choix distincts et étiquetés : Année (L1, L2, L3), Semestre, puis Matière,
 * filtrée par les deux premiers. `lockedLevel` fixe l'année (un étudiant rédige dans la sienne) : elle reste
 * affichée, verrouillée. `onChange` reçoit aussi le semestre absolu choisi (celui d'un document de matière annuelle).
 * `variant="fields"` : trois champs de formulaire ; `"chips"` : trois pastilles compactes (en-tête de l'éditeur).
 */
export function SubjectPicker({ subjects, value, defaultValue, onChange, name, id, level: preferredLevel, lockedLevel, semester, required, placeholder = "Choisir…", label = "Matière", variant = "fields", missing, className, selectClassName }: {
  subjects: PickableSubject[]; value?: number | null; defaultValue?: number | null; onChange?: (id: number | null, semester: number) => void; name?: string; id?: string;
  level?: number; lockedLevel?: number | null; semester?: number | null; required?: boolean; placeholder?: string; label?: ReactNode;
  variant?: "fields" | "chips"; missing?: { subject?: boolean; semester?: boolean }; className?: string; selectClassName?: string;
}) {
  const auto = useId();
  const [own, setOwn] = useState<number | null>(defaultValue ?? null);
  const current = value !== undefined ? value : own;
  const [term, setTerm] = useState(() => initialTerm(subjects, current, { level: preferredLevel, lockedLevel, semester }));
  // Une matière posée d'ailleurs (proposition de Campuss IA, co-auteur) : l'année et le semestre la suivent, ajustés pendant le rendu
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    if (current && !subjectsOfTerm(subjects, term.level, term.parity).some((s) => s.id === current)) setTerm(initialTerm(subjects, current, { lockedLevel, semester }));
  }
  const levels = lockedLevel ? [lockedLevel] : [...new Set(subjects.map((s) => s.level))].sort();
  const visible = subjectsOfTerm(subjects, term.level, term.parity, current);
  const chosen = subjects.find((s) => s.id === current);
  const pick = (next: number | null, at: Term = term) => { setOwn(next); onChange?.(next, absoluteSemester(at.level, at.parity)); };
  const changeTerm = (next: Term) => {
    setTerm(next);
    if (!chosen) return;
    // La matière choisie n'est plus de cette année ou de ce semestre : on la retire plutôt que d'afficher un choix contradictoire
    if (!subjectsOfTerm(subjects, next.level, next.parity).some((s) => s.id === chosen.id)) pick(null, next);
    // Matière annuelle : le semestre choisi devient celui du document
    else if (chosen.semester == null) pick(chosen.id, next);
  };
  const chips = variant === "chips";
  const select = chips ? cn("min-w-0 bg-transparent font-semibold", selectClassName) : cn(selectClass, "w-full", selectClassName);

  const slots: Slot[] = [
    {
      key: "level", label: "Année", locked: Boolean(lockedLevel),
      control: lockedLevel
        ? <span className={chips ? "inline-flex items-center gap-1 font-semibold" : cn(selectClass, "flex items-center gap-1.5 bg-muted text-muted-foreground")} title="Ton année d’études">
          L{lockedLevel}<Icon icon={IconLocked} size={16} className="size-3.5 opacity-70" /><span className="sr-only"> (ton année, fixée)</span>
        </span>
        : <select data-term="level" aria-label={chips ? "Année" : undefined} className={select} value={term.level} onChange={(event) => changeTerm({ ...term, level: Number(event.target.value) })}>
          {levels.map((l) => <option key={l} value={l}>L{l}</option>)}
        </select>,
    },
    {
      key: "parity", label: "Semestre", missing: missing?.semester,
      control: (
        <select data-term="parity" aria-label={chips ? "Semestre" : undefined} aria-invalid={missing?.semester || undefined} className={select} value={term.parity} onChange={(event) => changeTerm({ ...term, parity: Number(event.target.value) as 1 | 2 })}>
          <option value={1}>S{absoluteSemester(term.level, 1)}</option>
          <option value={2}>S{absoluteSemester(term.level, 2)}</option>
        </select>
      ),
    },
    {
      key: "subject", label, missing: missing?.subject, empty: !current,
      control: (
        <select id={id ?? `${auto}-matiere`} name={name} required={required} aria-label={chips ? "Matière" : undefined} aria-invalid={missing?.subject || undefined}
          className={cn(select, chips && "max-w-[min(22rem,60vw)]")} value={current ?? ""} onChange={(event) => pick(event.target.value ? Number(event.target.value) : null)}>
          <option value="">{placeholder}</option>
          {visible.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ),
    },
  ];

  if (chips) return (
    <span data-subject-picker className={cn("contents", className)}>
      {slots.map((slot) => {
        const Tag = slot.locked ? "span" : "label";
        return (
          <Tag key={slot.key} className="doc-field" data-empty={slot.empty || undefined} data-missing={slot.missing || undefined} data-locked={slot.locked || undefined}>
            <span className="text-muted-foreground">{slot.label}</span>
            {slot.control}
            {!slot.locked && <Icon icon={IconExpand} size={16} className="size-3 shrink-0 opacity-60" />}
          </Tag>
        );
      })}
    </span>
  );
  return (
    <div data-subject-picker className={cn("grid grid-cols-[minmax(4.5rem,auto)_minmax(4.5rem,auto)_minmax(0,1fr)] items-end gap-2", className)}>
      {slots.map((slot) => {
        const Tag = slot.locked ? "div" : "label";
        return (
          <Tag key={slot.key} className="grid min-w-0 gap-1.5">
            <span className="text-sm font-semibold">{slot.label}</span>
            {slot.control}
          </Tag>
        );
      })}
    </div>
  );
}
