"use client";

import { withCollaboration } from "@blocknote/core/yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { saveTurns } from "@/app/actions/notes";
import { Notice } from "@/components/action-form";
import { selectClass } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCESS_REVOKED, notesRoom, presenceColor, TOO_MANY_CONNECTIONS } from "@/lib/collab-presence";
import type { Turn } from "@/lib/notes-rules";
import { DocEditorInner, type DocEditorProps, type NotesChannel } from "./doc-editor-inner";

type Person = { id: string; name: string };
type Announcement = "sent" | "published";
const FRAGMENT = "document-store";
const STRING_FIELDS = ["title", "category", "chapter", "semester", "rights"];

/** Le tour de rôle : qui prend quelle partie. Enregistré à chaque changement, et affiché sans cadre à qui ne l'organise pas. */
function Turns({ docId, initial, members, canOrganize, onSaved }: { docId: string; initial: Turn[]; members: Person[]; canOrganize: boolean; onSaved: () => void }) {
  const [turns, setTurns] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // Une modification venue du délégué remplace la liste affichée
  if (seen !== initial) { setSeen(initial); setTurns(initial); }
  const save = async (next: Turn[]) => {
    const result = await saveTurns(docId, next).catch(() => ({ error: "Le tour de rôle n’a pas pu être enregistré." }));
    if (result.error) setError(result.error);
    else { setError(null); onSaved(); }
  };
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "À définir";
  if (!canOrganize && !turns.length) return null;
  return (
    <section aria-label="Tour de rôle" className="mt-6">
      <h2 className="section-title mb-2">Tour de rôle</h2>
      {canOrganize ? (
        <div className="grid gap-2">
          {turns.map((turn, index) => (
            <div key={index} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
              <Input aria-label={`Partie ${index + 1}`} value={turn.part} maxLength={120} placeholder="Partie du cours" className="h-9 bg-card"
                onChange={(event) => setTurns(turns.map((t, i) => (i === index ? { ...t, part: event.target.value } : t)))} onBlur={() => void save(turns)} />
              <select aria-label={`Qui prend la partie ${index + 1}`} className={selectClass} value={turn.userId ?? ""} onChange={(event) => { const next = turns.map((t, i) => (i === index ? { ...t, userId: event.target.value || null } : t)); setTurns(next); void save(next); }}>
                <option value="">À définir</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <Button type="button" size="sm" variant="ghost" aria-label={`Retirer la partie ${index + 1}`} onClick={() => { const next = turns.filter((_, i) => i !== index); setTurns(next); void save(next); }}>Retirer</Button>
            </div>
          ))}
          <div><Button type="button" size="sm" variant="outline" onClick={() => setTurns([...turns, { part: "", userId: null }])}>Ajouter une partie</Button></div>
        </div>
      ) : (
        <ul className="line-list">{turns.map((turn, index) => <li key={index} className="flex flex-wrap justify-between gap-x-3 py-2"><span className="font-semibold wrap-break-word">{turn.part}</span><span className="text-muted-foreground">{nameOf(turn.userId)}</span></li>)}</ul>
      )}
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

export type NotesEditorProps = Omit<DocEditorProps, "channel"> & { me: Person; turns: Turn[]; canOrganize: boolean; seeds: boolean; openGroup: boolean };

export function NotesEditorInner({ me, turns, canOrganize, seeds, openGroup, ...props }: NotesEditorProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<"revoked" | "limit" | "offline" | null>(null);
  const [peers, setPeers] = useState<Person[]>([]);

  const { doc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const room = notesRoom(props.docId);
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const provider = new HocuspocusProvider({
      url: `${scheme}://${location.host}/collab?room=${encodeURIComponent(room)}`, name: room, document: doc, token: "session",
      onClose: ({ event }) => {
        // Limite atteinte ou accès retiré : le navigateur n'insiste pas
        if (event.code === TOO_MANY_CONNECTIONS || event.code === ACCESS_REVOKED) { setProblem(event.code === ACCESS_REVOKED ? "revoked" : "limit"); setTimeout(() => provider.disconnect()); }
        else setProblem((old) => old ?? "offline");
      },
      onSynced: () => { setReady(true); setProblem(null); },
      onAuthenticationFailed: () => { setProblem("revoked"); setTimeout(() => provider.disconnect()); },
    });
    return { doc, provider };
  }, [props.docId]);
  useEffect(() => () => { provider.destroy(); doc.destroy(); }, [provider, doc]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    // L'identité affichée est imposée par le serveur d'après la session
    const update = () => {
      const seen = new Map<string, Person>();
      for (const state of awareness.getStates().values()) { const who = (state as { campuss?: Person }).campuss; if (who?.id) seen.set(who.id, who); }
      setPeers([...seen.values()].filter((p) => p.id !== me.id));
    };
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider, me.id]);

  const refresh = useCallback(() => router.refresh(), [router]);
  const members = useMemo(() => [{ id: props.author.id, name: props.author.name }, ...props.coauthors.map((c) => ({ id: c.id, name: c.name }))], [props.author, props.coauthors]);

  // Le tour de rôle a changé : le serveur a la version à jour
  useEffect(() => {
    const signals = doc.getMap("signals");
    const listener = (_: unknown, tx: Y.Transaction) => { if (!tx.local) refresh(); };
    signals.observe(listener);
    return () => signals.unobserve(listener);
  }, [doc, refresh]);

  const locked = problem === "revoked" || problem === "limit";
  const notes = useMemo<NotesChannel>(() => {
    const fields = doc.getMap("fields");
    const meta = doc.getMap("meta");
    return {
      seeds,
      configure: (options) => withCollaboration({ ...options, collaboration: { provider: provider as never, fragment: doc.getXmlFragment(FRAGMENT), user: { name: me.name, color: presenceColor(me.id) }, showCursorLabels: "activity" } } as never),
      ready,
      locked,
      isEmpty: () => doc.getXmlFragment(FRAGMENT).length === 0,
      markSeeded: () => { if (meta.get("seeded")) return false; meta.set("seeded", true); return true; },
      shareFields: (patch) => doc.transact(() => { for (const [key, value] of Object.entries(patch)) fields.set(key, value); }),
      // Ces valeurs viennent d'un autre navigateur : le type est vérifié ici, le contenu à l'enregistrement
      onFields: (listener) => {
        const read = (keys: Iterable<string>) => {
          const patch: Record<string, unknown> = {};
          for (const key of keys) {
            const value = fields.get(key);
            if ((STRING_FIELDS.includes(key) && typeof value === "string" && value.length <= 200) || (key === "subject" && (value === null || typeof value === "number"))) patch[key] = value;
          }
          if (Object.keys(patch).length) listener(patch);
        };
        const observer = (event: Y.YMapEvent<unknown>, tx: Y.Transaction) => { if (!tx.local) read(event.keysChanged); };
        fields.observe(observer);
        read(fields.keys());
        return () => fields.unobserve(observer);
      },
      announce: (what) => meta.set(what, Date.now()),
      onAnnounce: (listener) => {
        const observer = (event: Y.YMapEvent<unknown>, tx: Y.Transaction) => { if (tx.local) return; for (const key of event.keysChanged) if (key === "sent" || key === "published") listener(key as Announcement); };
        meta.observe(observer);
        return () => meta.unobserve(observer);
      },
      panel: (
        <>
          <div className="mt-6 grid gap-2" aria-live="polite">
            <p data-testid="notes-presence" className="text-sm text-muted-foreground">
              {!ready && !problem ? "Connexion…" : peers.length ? `Avec ${peers.map((p) => p.name).join(", ")}` : openGroup ? "Tu es seul pour l’instant. Ta licence peut rejoindre depuis la page de la matière." : "Tu es seul pour l’instant. Ajoute des amis comme co-auteurs pour écrire ensemble."}
            </p>
            {problem === "revoked" && <Notice tone="error">Tu n’as plus accès à ces notes.</Notice>}
            {problem === "limit" && <Notice tone="error">Trop de connexions ouvertes sur ton compte. Ferme un onglet, puis recharge cette page.</Notice>}
            {problem === "offline" && <Notice tone="info">Connexion perdue. Continue d’écrire : tes notes repartent à la reconnexion.</Notice>}
          </div>
          <Turns key={canOrganize ? "organize" : JSON.stringify(turns)} docId={props.docId} initial={turns} members={members} canOrganize={canOrganize} onSaved={() => { doc.getMap("signals").set("turns", Date.now()); }} />
        </>
      ),
    };
  }, [doc, provider, me, ready, locked, problem, peers, openGroup, seeds, props.docId, turns, members, canOrganize]);

  return <DocEditorInner {...props} channel={notes} />;
}
