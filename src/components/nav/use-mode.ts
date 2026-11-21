"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { modeOf, type Mode, type Role } from "@/lib/modes";

const KEY = "campuss-mode";
const read = () => { try { return (sessionStorage.getItem(KEY) as Mode | null) ?? undefined; } catch { return undefined; } };
const noop = () => () => undefined;

/** L'espace courant ; sur les pages communes (Moi, notifications, paramètres), celui d'où l'on vient. */
export function useMode(role: Role): Mode {
  const pathname = usePathname();
  const previous = useSyncExternalStore(noop, read, () => undefined);
  const mode = modeOf(pathname, role, previous);
  useEffect(() => { try { sessionStorage.setItem(KEY, mode); } catch { /* navigation privée */ } }, [mode]);
  return mode;
}
