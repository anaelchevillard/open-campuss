// Chargé avant le serveur Next (node --import) : le temps réel écoute sur le même port et le même domaine,
// donc rien à changer dans Traefik ni dans le pare-feu. Empaqueté à part par scripts/build-collab.mjs.
import { createHash } from "node:crypto";
import { Server } from "node:http";
import { Hocuspocus } from "@hocuspocus/server";
import crossws from "crossws/adapters/node";
import { Pool } from "pg";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { ACCESS_REVOKED, canOpenConnection, imposeNotesPresence, imposePresence, parseRoom, type PresenceOwner, TOO_MANY_CONNECTIONS } from "../lib/collab-presence";

const SESSION_COOKIE = "__Host-campus";
const RECHECK_MS = 60_000;
const MAX_STATE = 30 * 1024 * 1024;
// Une salle de révision ne transporte que des signaux ; seules les notes ont besoin de messages plus gros (un long collage)
const MAX_SIGNAL_MESSAGE = 256 * 1024;
const MAX_NOTES_MESSAGE = 2 * 1024 * 1024;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, statement_timeout: 30_000 });

// Même règle que requireUser : un compte qui modère (admin, délégué) n'entre qu'avec un second facteur
const STRONG_AUTH = `(u.role not in ('admin', 'delegate') or u.totp_enabled or exists (select 1 from passkeys k where k.user_id = u.id))`;

function userFrom(cookieHeader: string | null | undefined) {
  const match = cookieHeader?.split(/;\s*/).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  return createHash("sha256").update(match.slice(SESSION_COOKIE.length + 1)).digest("hex");
}

/** La session et l'appartenance à l'espace sont relues en base : une invitation retirée coupe l'accès. */
async function allowed(hash: string, spaceId: string) {
  const { rows } = await pool.query(
    `select u.id, u.name from sessions s join users u on u.id = s.user_id
     join revision_spaces r on r.id = $2
     where s.token_hash = $1 and s.expires_at > now() and s.mfa_pending = false and u.status = 'active' and ${STRONG_AUTH}
       and (r.owner_id = u.id or exists (select 1 from revision_members m where m.space_id = r.id and m.user_id = u.id and m.status = 'accepted'))`,
    [hash, spaceId],
  );
  return rows[0] as { id: string; name: string } | undefined;
}

/** Même règle que canEdit (access-server.ts), sur un brouillon dont la prise de notes est encore ouverte. */
async function allowedInNotes(hash: string, documentId: string) {
  const { rows } = await pool.query(
    `select u.id, u.name from sessions s join users u on u.id = s.user_id
     join documents d on d.id = $2 join collab_notes n on n.document_id = d.id
     where s.token_hash = $1 and s.expires_at > now() and s.mfa_pending = false and u.status = 'active' and ${STRONG_AUTH}
       and n.closed_at is null and d.kind = 'editor' and d.published = false
       and (u.role = 'admin' or (d.program_id = u.program_id and (u.role = 'delegate' or d.created_by = u.id
         or exists (select 1 from doc_authors a where a.document_id = d.id and a.user_id = u.id))))`,
    [hash, documentId],
  );
  return rows[0] as { id: string; name: string } | undefined;
}

function allowedInRoom(hash: string, room: NonNullable<ReturnType<typeof parseRoom>>) {
  return room.kind === "notes" ? allowedInNotes(hash, room.id) : allowed(hash, room.id);
}

async function accountOf(hash: string) {
  const { rows } = await pool.query(`select s.user_id as id from sessions s where s.token_hash = $1 and s.expires_at > now() and s.mfa_pending = false`, [hash]);
  return rows[0]?.id as string | undefined;
}

// Par compte et non par session : ouvrir d'autres appareils ne permet pas de multiplier les connexions
const openByAccount = new Map<string, Set<object>>();

function release(userId: string, peer: object) {
  const peers = openByAccount.get(userId);
  if (peers?.delete(peer) && !peers.size) openByAccount.delete(userId);
}

// Pour les révisions, rien n'est conservé ici : les annotations vivent en base, ce canal annonce seulement qu'elles ont changé.
// Seules les salles de notes écrivent leur état.
const hocuspocus = new Hocuspocus({
  debounce: 2000,
  maxDebounce: 10_000,
  quiet: true,
  async onAuthenticate({ documentName, requestHeaders, requestParameters, connectionConfig }) {
    const hash = userFrom(requestHeaders.get ? requestHeaders.get("cookie") : (requestHeaders as unknown as Record<string, string>).cookie);
    const room = parseRoom(documentName);
    // Une connexion, une salle : celle de son adresse, la seule que la vérification périodique relit
    if (!hash || !room || requestParameters.get("room") !== documentName) throw new Error("accès refusé");
    const member = await allowedInRoom(hash, room);
    if (!member) throw new Error("accès refusé");
    connectionConfig.readOnly = false;
    return { hash, userId: member.id, name: member.name } satisfies PresenceOwner & { hash: string };
  },
  async beforeHandleAwareness({ states, removedClients, context, documentName }) {
    if (!context?.userId) { states.clear(); removedClients.clear(); return; }
    (parseRoom(documentName)?.kind === "notes" ? imposeNotesPresence : imposePresence)(states, removedClients, context as PresenceOwner);
  },
  async onLoadDocument({ documentName, document }) {
    const room = parseRoom(documentName);
    if (room?.kind !== "notes") return document;
    const { rows } = await pool.query("select state from collab_notes where document_id = $1 and closed_at is null", [room.id]);
    if (rows[0]?.state) applyUpdate(document, new Uint8Array(rows[0].state));
    return document;
  },
  async onStoreDocument({ documentName, document }) {
    const room = parseRoom(documentName);
    if (room?.kind !== "notes") return;
    const state = Buffer.from(encodeStateAsUpdate(document));
    if (state.length > MAX_STATE) { console.warn("notes trop volumineuses :", documentName); return; }
    // Une fois publiées, les notes ne reviennent pas : la dernière déconnexion n'écrit plus rien
    await pool.query("update collab_notes set state = $2, updated_at = now() where document_id = $1 and closed_at is null", [room.id, state]);
  },
});

const originOk = (origin: string | null | undefined) => {
  const base = process.env.BASE_URL;
  try { return Boolean(origin && base && new URL(origin).host === new URL(base).host); } catch { return false; }
};

const sockets = crossws({
  serverOptions: { maxPayload: MAX_NOTES_MESSAGE },
  hooks: {
    upgrade(request) {
      if (!originOk(request.headers.get("origin"))) throw new Response("Origine refusée", { status: 403 });
    },
    open(peer) {
      const connection = hocuspocus.handleConnection(peer.websocket as never, peer.request as Request);
      (peer as unknown as { _campuss: unknown })._campuss = connection;
      (peer.websocket as unknown as { on?: (event: string, listener: () => void) => void }).on?.("pong", () => connection.touch());
      // Une session expirée ou une invitation retirée ne garde pas la connexion ouverte
      const hash = userFrom((peer.request as Request).headers.get("cookie"));
      const room = parseRoom(new URL((peer.request as Request).url, "http://local").searchParams.get("room"));
      (peer as unknown as { _maxMessage: number })._maxMessage = room?.kind === "notes" ? MAX_NOTES_MESSAGE : MAX_SIGNAL_MESSAGE;
      const timer = setInterval(async () => {
        if (!hash || !room || !(await allowedInRoom(hash, room).catch(() => "erreur"))) peer.close(ACCESS_REVOKED, "accès retiré");
      }, RECHECK_MS);
      if (hash) {
        void accountOf(hash).then((userId) => {
          const state = peer as unknown as { _closed?: boolean; _account?: string };
          if (!userId || state._closed) return;
          const peers = openByAccount.get(userId) ?? new Set<object>();
          if (!canOpenConnection(peers.size)) { peer.close(TOO_MANY_CONNECTIONS, "trop de connexions"); return; }
          peers.add(peer);
          openByAccount.set(userId, peers);
          state._account = userId;
        }).catch((error) => console.warn("temps réel :", (error as Error).message));
      }
      timer.unref();
      (peer as unknown as { _timer: NodeJS.Timeout })._timer = timer;
    },
    message(peer, message) {
      if (message.uint8Array().length > ((peer as unknown as { _maxMessage?: number })._maxMessage ?? MAX_SIGNAL_MESSAGE)) { peer.close(1009, "message trop gros"); return; }
      (peer as unknown as { _campuss?: { handleMessage: (data: Uint8Array) => void } })._campuss?.handleMessage(message.uint8Array());
    },
    close(peer, event) {
      clearInterval((peer as unknown as { _timer?: NodeJS.Timeout })._timer);
      const state = peer as unknown as { _closed?: boolean; _account?: string };
      state._closed = true;
      if (state._account) release(state._account, peer);
      (peer as unknown as { _campuss?: { handleClose: (e: unknown) => void } })._campuss?.handleClose({ code: event.code, reason: event.reason });
    },
    error(_, error) { console.warn("temps réel :", (error as Error).message); },
  },
});

const emit = Server.prototype.emit;
Server.prototype.emit = function patched(this: Server, event: string, ...args: unknown[]) {
  if (event === "upgrade") {
    const [request, socket, head] = args as Parameters<typeof sockets.handleUpgrade>;
    if (request.url?.startsWith("/collab")) { void sockets.handleUpgrade(request, socket, head); return true; }
  }
  return (emit as (this: Server, ...all: unknown[]) => boolean).call(this, event, ...args);
} as typeof Server.prototype.emit;
