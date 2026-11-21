"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Span } from "@/lib/annotate";
import { ACCESS_REVOKED, presenceColor as colorOf, TOO_MANY_CONNECTIONS } from "@/lib/collab-presence";

export type LivePeer = { id: string; name: string; color: string; cursor: Span | null };
export const PRESENCE_EVENT = "campuss-presence";

type Awareness = { setLocalStateField: (field: string, value: unknown) => void; getStates: () => Map<number, Record<string, unknown>>; on: (event: string, listener: () => void) => void; off: (event: string, listener: () => void) => void };

/**
 * Le temps réel ne sert qu'à prévenir : les annotations vivent en base, et une révision seule n'ouvre aucune connexion.
 * Une coupure ne perd donc rien ; les autres verront simplement la modification au prochain chargement.
 */
export function useLive(spaceId: string | null, me: { id: string }, onRemoteChange: () => void) {
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const channel = useRef<{ awareness: Awareness; bump: () => void } | null>(null);
  const callback = useRef(onRemoteChange);
  useEffect(() => { callback.current = onRemoteChange; }, [onRemoteChange]);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    let teardown = () => {};
    void (async () => {
      const [{ HocuspocusProvider }, Y] = await Promise.all([import("@hocuspocus/provider"), import("yjs")]);
      if (cancelled) return;
      const doc = new Y.Doc();
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      // Limite atteinte ou accès retiré : le navigateur n'insiste pas, l'annotation continue sans temps réel
      const provider = new HocuspocusProvider({
        url: `${scheme}://${location.host}/collab?room=${spaceId}`, name: spaceId, document: doc, token: "session",
        onClose: ({ event }) => { if (event.code === TOO_MANY_CONNECTIONS || event.code === ACCESS_REVOKED) setTimeout(() => { teardown(); setPeers([]); }); },
      });
      const awareness = provider.awareness as unknown as Awareness;
      const sync = doc.getMap("sync");
      const onSync = (_: unknown, tx: { local: boolean }) => { if (!tx.local) callback.current(); };
      sync.observe(onSync);
      // Le serveur ajoute l'identité d'après la session : ce qu'enverrait le navigateur serait ignoré
      awareness.setLocalStateField("campuss", { cursor: null });
      const update = () => {
        const seen = new Map<string, LivePeer>();
        for (const state of awareness.getStates().values()) {
          const who = state.campuss as Omit<LivePeer, "color"> | undefined;
          if (who?.id && who.id !== me.id) seen.set(who.id, { ...who, color: colorOf(who.id) });
        }
        const list = [...seen.values()];
        setPeers(list);
        dispatchEvent(new CustomEvent(PRESENCE_EVENT, { detail: list }));
      };
      awareness.on("change", update);
      channel.current = { awareness, bump: () => sync.set("v", Math.random()) };
      teardown = () => { teardown = () => {}; sync.unobserve(onSync); awareness.off("change", update); channel.current = null; provider.destroy(); doc.destroy(); };
    })();
    return () => { cancelled = true; teardown(); setPeers([]); };
  }, [spaceId, me.id]);

  const signal = useCallback(() => channel.current?.bump(), []);
  const setCursor = useCallback((cursor: Span | null) => channel.current?.awareness.setLocalStateField("campuss", { cursor }), []);
  return useMemo(() => ({ peers, signal, setCursor }), [peers, signal, setCursor]);
}
