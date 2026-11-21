"use client";

import { useSyncExternalStore } from "react";
import { markdownToBlocks } from "@/lib/blocks";
import { readImportResponse } from "@/lib/import-client";
import type { PhotoPage } from "./photo-pages";

/**
 * Ce que l'éditeur prête aux tuiles pour recevoir un import. `addBlocks` remplace un brouillon vierge et ajoute à la fin sinon ;
 * `imported` laisse l'éditeur reprendre le titre et demander ses suggestions (titre, matière, type).
 */
export type ImportTarget = {
  addBlocks: (blocks: unknown[]) => void;
  imported?: (info: { title?: string; filename?: string; notes?: string[] }) => void;
};

export type Provider = "notion" | "google";

/** Un import en cours sur un brouillon. Il vit hors des composants : les tuiles peuvent disparaître pendant qu'il avance. */
export type ImportJob = {
  kind: "photo" | "file" | "source";
  phase: "attest" | "running" | "error" | "done";
  label: string;
  pages: PhotoPage[];
  done: number;
  total: number;
  left: number | null;
  error: string | null;
};

const jobs = new Map<string, ImportJob>();
const targets = new Map<string, ImportTarget>();
const listeners = new Set<() => void>();
const WAITING = "En attente : un autre import est en cours, le tien suit.";

function emit() { for (const listener of listeners) listener(); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function set(documentId: string, job: ImportJob | null) {
  if (job) jobs.set(documentId, job);
  else jobs.delete(documentId);
  emit();
}
function patch(documentId: string, change: Partial<ImportJob>) {
  const job = jobs.get(documentId);
  if (job) set(documentId, { ...job, ...change });
}

/** L'éditeur (ou les tuiles, qui le reçoivent de lui) déclare où verser ce qui arrive. Le dernier déclaré gagne. */
export function setImportTarget(documentId: string, target: ImportTarget) { targets.set(documentId, target); }
const target = (documentId: string) => targets.get(documentId);

export function useImportJob(documentId: string) {
  return useSyncExternalStore(subscribe, () => jobs.get(documentId) ?? null, () => null);
}

/** Pour l'éditeur : garder les tuiles affichées tant qu'un import avance, même après l'arrivée des premières pages. */
export function useImportBusy(documentId: string) {
  const job = useImportJob(documentId);
  return Boolean(job && job.phase !== "error");
}

export function dismissJob(documentId: string) { set(documentId, null); }

// --- Photos et PDF scannés : Campuss IA, une page après l'autre

const running = new Set<string>();

/** Ajoute des pages. Sans engagement déjà donné, on attend la case (une fois par import). */
export function queuePhotos(documentId: string, pages: PhotoPage[], { accepted, left }: { accepted: boolean; left: number | null }) {
  const job = jobs.get(documentId);
  if (job?.kind === "photo" && job.phase !== "done") {
    set(documentId, { ...job, pages: [...job.pages, ...pages], total: job.total + pages.length, error: null, phase: job.phase === "error" ? (accepted ? "running" : "attest") : job.phase });
  } else {
    set(documentId, { kind: "photo", phase: accepted ? "running" : "attest", label: "Campuss IA transcrit…", pages, done: 0, total: pages.length, left, error: null });
  }
  if (accepted) void transcribe(documentId);
}

export function startPhotos(documentId: string) {
  patch(documentId, { phase: "running", error: null });
  void transcribe(documentId);
}

export function movePages(documentId: string, pages: PhotoPage[]) { patch(documentId, { pages }); }
export function removePage(documentId: string, id: number) {
  const job = jobs.get(documentId);
  if (!job) return;
  const pages = job.pages.filter((page) => page.id !== id);
  if (!pages.length && job.phase !== "running") return set(documentId, null);
  set(documentId, { ...job, pages, total: job.total - 1 });
}

async function transcribe(documentId: string) {
  if (running.has(documentId)) return;
  running.add(documentId);
  let first = true;
  try {
    for (;;) {
      const job = jobs.get(documentId);
      if (!job || job.phase !== "running") return;
      const page = job.pages[0];
      if (!page) break;
      const response = await fetch("/api/editor/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attest: true, document: documentId, image: page.image }) }).catch(() => null);
      const data = await response?.json().catch(() => ({})) as { markdown?: string; error?: string; left?: number; quota?: boolean } | undefined;
      if (!response?.ok || !data?.markdown) {
        // La page reste en tête : « Réessayer » reprend là où ça s'est arrêté
        patch(documentId, { phase: "error", error: data?.error ?? "La transcription a échoué. Réessaie dans un instant.", ...(data?.quota ? { left: 0 } : {}) });
        return;
      }
      target(documentId)?.addBlocks(markdownToBlocks(data.markdown));
      const now = jobs.get(documentId);
      if (now) set(documentId, { ...now, pages: now.pages.filter((p) => p.id !== page.id), done: now.done + 1, left: typeof data.left === "number" ? data.left : now.left });
      if (first) { first = false; target(documentId)?.imported?.({ filename: "" }); }
    }
    // La mention « à vérifier » reste sous les yeux jusqu'à ce qu'on la ferme
    patch(documentId, { phase: "done" });
  } finally {
    running.delete(documentId);
  }
}

// --- Fichier (Word, PDF texte, Markdown…) et page d'un compte connecté : conversion sur le serveur

type ImportReply = { blocks?: unknown[]; notes?: string[]; error?: string; title?: string; scanned?: boolean; lost?: boolean };

async function convert(documentId: string, kind: "file" | "source", label: string, send: () => Promise<Response>): Promise<ImportReply | null> {
  set(documentId, { kind, phase: "running", label, pages: [], done: 0, total: 1, left: null, error: null });
  try {
    const response = await send();
    const { status, data } = await readImportResponse<ImportReply>(response, ({ phase }) => patch(documentId, { label: phase === "waiting" ? WAITING : label }));
    if (status !== 200 || !data.blocks) {
      if (data.scanned) { set(documentId, null); return data; }
      patch(documentId, { phase: "error", error: data.error ?? "L’import a échoué." });
      return data;
    }
    target(documentId)?.addBlocks(data.blocks);
    set(documentId, null);
    return data;
  } catch {
    patch(documentId, { phase: "error", error: "L’import a échoué. Vérifie ta connexion et réessaie." });
    return null;
  }
}

export async function importFile(documentId: string, file: File) {
  const data = await convert(documentId, "file", `Conversion de « ${file.name} »…`, () => fetch(`/api/editor/import?doc=${documentId}`, { method: "POST", body: file, headers: { "x-filename": encodeURIComponent(file.name) } }));
  if (data?.blocks) target(documentId)?.imported?.({ title: file.name.replace(/\.[^.]+$/, "").slice(0, 200), filename: file.name, notes: data.notes });
  return data;
}

export async function importSource(documentId: string, provider: Provider, page: { id: string; title: string }) {
  const name = provider === "notion" ? "Notion" : "Google Docs";
  const data = await convert(documentId, "source", `Import depuis ${name}…`, () => fetch("/api/editor/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, source: { provider, id: page.id, title: page.title } }) }));
  if (data?.blocks) target(documentId)?.imported?.({ title: data.title ?? page.title, filename: page.title, notes: data.notes });
  return data;
}

/** Le navigateur prépare (lecture d'un PDF, réduction des photos) avant d'envoyer quoi que ce soit. */
export function prepareJob(documentId: string, label: string) {
  if (jobs.get(documentId)?.phase === "running") return;
  set(documentId, { kind: "file", phase: "running", label, pages: [], done: 0, total: 1, left: null, error: null });
}

export function failJob(documentId: string, error: string) {
  const job = jobs.get(documentId);
  set(documentId, { ...(job ?? { kind: "file", label: "", pages: [], done: 0, total: 0, left: null }), phase: "error", error });
}

/** Fin d'une préparation qui n'a rien donné (aucun fichier lisible) : on revient aux tuiles. */
export function clearPrepared(documentId: string) {
  const job = jobs.get(documentId);
  if (job?.kind === "file" && job.phase === "running") set(documentId, null);
}
