"use client";

import { useEffect, useState } from "react";
import { artifactPreviewUrl } from "@/app/actions/rich";
import { ArtifactFrame } from "@/components/rich/artifact-frame";
import { artifactRef, type ArtifactDisplay } from "@/lib/rich/artifact";
import { useEditorDoc } from "./editor-doc";

type Props = { src: string; entry: string; title: string; display: string };

/**
 * Le bloc « Artefact HTML » dans l'éditeur. Vide : coller le code (HTML, React, Markdown) ou choisir
 * un fichier (.html, .jsx, .tsx, .md, .zip), comme « Coller un artefact ». Rempli : l'aperçu isolé, le titre et
 * l'affichage (bloc ajusté au contenu, ou page HTML du cours à hauteur d'écran).
 */
export function ArtifactBlock({ props, onChange }: { props: Props; onChange: (next: Partial<Props>) => void }) {
  const docId = useEditorDoc();
  const ref = artifactRef(props);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; url: string | null; error?: string } | null>(null);
  const previewKey = ref && docId ? `${ref.fileId}/${ref.entry}` : null;

  useEffect(() => {
    if (!previewKey || !docId) return;
    let live = true;
    const [fileId, ...entry] = previewKey.split("/");
    void artifactPreviewUrl(docId, `/files/${fileId}`, entry.join("/")).then((result) => {
      if (live) setPreview({ key: previewKey, url: "url" in result ? result.url : null, error: "error" in result ? result.error : undefined });
    });
    return () => { live = false; };
  }, [previewKey, docId]);

  const send = async (body: Blob | string, filename: string) => {
    if (!docId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/editor/artifacts?doc=${docId}`, { method: "POST", headers: { "x-filename": encodeURIComponent(filename), "Content-Type": "application/octet-stream" }, body });
      const result = await response.json().catch(() => ({ error: "L’envoi a échoué." })) as { src?: string; entry?: string; error?: string };
      if (!response.ok || !result.src) setError(result.error ?? "L’envoi a échoué.");
      else onChange({ src: result.src, entry: result.entry ?? "index.html", title: props.title || filename.replace(/\.[^.]+$/, "") || "Artefact" });
    } catch {
      setError("L’envoi a échoué. Vérifie ta connexion.");
    } finally {
      setBusy(false);
    }
  };

  if (!docId) return <p contentEditable={false} className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Un artefact HTML s’insère dans un cours.</p>;
  const field = "h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm";
  if (!ref) {
    return (
      <div contentEditable={false} className="grid w-full max-w-2xl gap-2 rounded-lg bg-muted p-3">
        <p className="text-sm font-semibold">Artefact HTML</p>
        <textarea aria-label="Code de l’artefact" value={code} onChange={(event) => setCode(event.target.value)} rows={6} spellCheck={false}
          placeholder="Colle le code : HTML, composant React (JSX) ou Markdown" className="min-h-28 rounded-md border border-input bg-card p-2 font-mono text-[0.8rem]" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || !code.trim()} onClick={() => void send(code, "")} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Envoi…" : "Insérer le code"}</button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input px-3 text-sm font-semibold hover:bg-card">
            Choisir un fichier
            <input type="file" accept=".html,.htm,.jsx,.tsx,.md,.markdown,.zip" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void send(file, file.name); }} />
          </label>
          <span className="text-xs text-muted-foreground">.html, .jsx, .tsx, .md (2 Mo) ou .zip (10 Mo)</span>
        </div>
        {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
        <p className="text-xs text-muted-foreground">Affiché dans un cadre isolé : il ne voit ni ton compte ni la page, et ne contacte aucun site.</p>
      </div>
    );
  }
  const shown = preview?.key === previewKey ? preview : null;
  return (
    <div contentEditable={false} className="grid w-full gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Titre de l’artefact" value={props.title} onChange={(event) => onChange({ title: event.target.value.slice(0, 200) })} placeholder="Titre" className={`${field} flex-1`} />
        <select aria-label="Affichage" value={ref.display} onChange={(event) => onChange({ display: event.target.value as ArtifactDisplay })} className={field}>
          <option value="bloc">Bloc ajusté</option>
          <option value="page">Page HTML du cours</option>
        </select>
        <button type="button" onClick={() => onChange({ src: "", entry: "index.html" })} className="h-9 rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted">Remplacer</button>
      </div>
      {shown?.error ? <p className="text-sm text-muted-foreground">{shown.error}</p> : <ArtifactFrame src={shown?.url ?? null} title={props.title || "Artefact"} display={ref.display} />}
    </div>
  );
}
