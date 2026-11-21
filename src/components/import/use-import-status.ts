"use client";

import { useEffect, useState } from "react";
import type { Provider } from "./import-jobs";

export type AccountState = { provider: Provider; name: string; connected: boolean; broken: boolean; label: string };
export type ImportStatus = { ocr: boolean; ocrAccepted: boolean; pagesLeft: number | null; files: boolean; accounts: AccountState[] };

// Les tuiles se remontent souvent (première frappe effacée, retour) : la réponse sert 30 s
const cache = new Map<string, { at: number; value: Promise<ImportStatus | null> }>();

function load(documentId: string) {
  const hit = cache.get(documentId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const value = fetch(`/api/connected/status${documentId ? `?doc=${documentId}` : ""}`).then((r) => (r.ok ? r.json() as Promise<ImportStatus> : null)).catch(() => null)
    // Un échec (connexion coupée, erreur du serveur) n'est pas gardé : sinon « Importer » resterait vide 30 s
    .then((status) => { if (!status && cache.get(documentId)?.value === value) cache.delete(documentId); return status; });
  cache.set(documentId, { at: Date.now(), value });
  return value;
}

export function forgetImportStatus() { cache.clear(); }

/** `null` tant que rien n'est connu : les tuiles n'apparaissent qu'avec ce qu'elles peuvent vraiment faire. */
export function useImportStatus(documentId: string) {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void load(documentId).then((value) => { if (alive) setStatus(value); });
    return () => { alive = false; };
  }, [documentId]);
  return [status, setStatus] as const;
}
