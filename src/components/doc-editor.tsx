"use client";

import dynamic from "next/dynamic";

/** L'éditeur ne fonctionne que dans le navigateur. Son squelette reprend la page finale, pour que rien ne saute à l'arrivée. */
export const DocEditor = dynamic(() => import("./editor/doc-editor-inner").then((m) => m.DocEditorInner), {
  ssr: false,
  loading: () => <div className="mx-auto grid max-w-[42rem] gap-4 pt-16" aria-busy="true"><div className="frame-loading h-4 w-40 rounded" /><div className="frame-loading h-10 w-3/4 rounded" /><div className="frame-loading h-80 rounded-lg" /></div>,
});
