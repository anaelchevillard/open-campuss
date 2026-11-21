"use client";

import dynamic from "next/dynamic";

/** L'éditeur ne fonctionne que dans le navigateur ; le squelette reprend la page finale. */
export const BlogEditor = dynamic(() => import("./blog-editor-inner").then((m) => m.BlogEditorInner), {
  ssr: false,
  loading: () => <div className="mx-auto grid max-w-(--measure) gap-4 pt-16" aria-busy="true"><div className="h-4 w-32 rounded bg-muted" /><div className="h-10 w-3/4 rounded bg-muted" /><div className="h-80 rounded-lg bg-muted" /></div>,
});
