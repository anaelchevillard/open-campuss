"use client";

import dynamic from "next/dynamic";

/** Yjs et le fournisseur temps réel ne se chargent que pour cette page. */
export const NotesEditor = dynamic(() => import("./editor/notes-editor-inner").then((m) => m.NotesEditorInner), {
  ssr: false,
  loading: () => <div className="mx-auto grid max-w-[42rem] gap-4 pt-16" aria-busy="true"><div className="frame-loading h-4 w-40 rounded" /><div className="frame-loading h-10 w-3/4 rounded" /><div className="frame-loading h-80 rounded-lg" /></div>,
});
