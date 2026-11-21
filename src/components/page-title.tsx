"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Le titre de la page remonte jusqu'à l'en-tête du téléphone (TopBar), qui n'a pas d'autre moyen de le connaître
const Ctx = createContext<{ title: string; set: (t: string) => void } | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, set] = useState("");
  return <Ctx.Provider value={{ title, set }}>{children}</Ctx.Provider>;
}

export function usePageTitle() {
  return useContext(Ctx)?.title ?? "";
}

/** Posé par PageHeader : déclare le titre court de l'écran. */
export function PageTitle({ title }: { title: string }) {
  const ctx = useContext(Ctx);
  const set = ctx?.set;
  useEffect(() => {
    set?.(title);
    return () => set?.("");
  }, [title, set]);
  return null;
}
