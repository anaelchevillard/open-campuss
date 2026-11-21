"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { IconClose, IconSearch } from "@/lib/icons";

/** Recherche locale d'une page : le texte va dans ?q= après une courte pause, la page se recharge sans bouger. */
export function SearchField({ placeholder = "Chercher un cours" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const push = (text: string) => {
    const next = new URLSearchParams(params.toString());
    if (text) next.set("q", text); else next.delete("q");
    const query = next.toString();
    start(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  const change = (text: string) => {
    setValue(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => push(text.trim()), 250);
  };
  return (
    <form role="search" className="relative w-full md:max-w-sm" onSubmit={(event) => { event.preventDefault(); clearTimeout(timer.current); push(value.trim()); }}>
      <Icon icon={IconSearch} size={20} className={`pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 transition-colors ${pending ? "text-brand-text" : "text-muted-foreground"}`} />
      <input ref={input} type="search" value={value} onChange={(e) => change(e.target.value)} placeholder={placeholder} aria-label="Rechercher" autoComplete="off" enterKeyHint="search"
        className="h-11 w-full rounded-lg border border-input bg-card pr-10 pl-10 text-base outline-none transition-[border-color,box-shadow] duration-(--dur-fast) placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" aria-label="Effacer la recherche" onClick={() => { setValue(""); clearTimeout(timer.current); push(""); input.current?.focus(); }}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
          <Icon icon={IconClose} size={16} />
        </button>
      )}
    </form>
  );
}
