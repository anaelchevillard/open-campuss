"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PhotoEntry } from "@/components/import/photo-entry";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { createEntries, type CreateOptions } from "@/components/create-entries";
import type { IconData } from "@/lib/icons";

export type { CreateOptions };

const Ctx = createContext<{ open: () => void } | null>(null);

/** Ouvre la feuille « Commencer avec… » depuis n'importe où (le +, « Nouveau », un état vide). */
export function useCreateSheet() {
  return useContext(Ctx) ?? { open: () => undefined };
}

export function CreateSheetProvider({ options, children }: { options: CreateOptions; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      <CreateSheet open={open} onOpenChange={setOpen} options={options} />
    </Ctx.Provider>
  );
}

function Entry({ href, icon, label, onNavigate }: { href: string; icon: IconData; label: string; onNavigate: () => void }) {
  return (
    <li>
      <Link href={href} replace onClick={onNavigate} className="flex min-h-[4.5rem] items-center gap-4 rounded-2xl px-4 transition-colors hover:bg-muted focus-visible:bg-muted">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon icon={icon} /></span>
        <span className="text-base font-semibold">{label}</span>
      </Link>
    </li>
  );
}

/** « Commencer avec… » : l'ordre est fixe (DESIGN.md §5.4). Dans une matière, la matière est préremplie. */
export function CreateSheet({ open, onOpenChange, options }: { open: boolean; onOpenChange: (open: boolean) => void; options: CreateOptions }) {
  const pathname = usePathname();
  const subject = /^\/matieres\/(\d+)/.exec(pathname)?.[1];
  const go = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Commencer avec…" size="md">
      <ul className="stagger -mx-2 grid gap-1 pb-2">
        {options.ai && <li className="mx-2 mb-2"><PhotoEntry subjectId={subject ? Number(subject) : undefined} onNavigate={go} /></li>}
        {createEntries(options, subject).map((entry) => <Entry key={entry.label} {...entry} onNavigate={go} />)}
      </ul>
    </ResponsiveSheet>
  );
}
