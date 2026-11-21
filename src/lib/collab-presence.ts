/** Ce que le serveur laisse passer de la présence : l'identité vient de la session, le navigateur ne fournit que son curseur. */
export const MAX_CONNECTIONS_PER_ACCOUNT = 5;
export const TOO_MANY_CONNECTIONS = 4429;
export const ACCESS_REVOKED = 4403;

export type PresenceOwner = { userId: string; name: string; clientId?: number };

const position = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= -1 && value <= 5_000_000;

function cursorOf(value: unknown) {
  const span = value as { start?: unknown; end?: unknown } | null | undefined;
  return span && position(span.start) && position(span.end) ? { start: span.start as number, end: span.end as number } : null;
}

/**
 * Une connexion ne parle que pour un seul client Yjs : le premier qu'elle annonce. Sans ça, relayer l'état d'un autre
 * ferait apparaître cet autre sous le nom de l'expéditeur, et une fausse suppression ferait disparaître quelqu'un.
 */
export function imposePresence(states: Map<number, Record<string, unknown>>, removed: Set<number>, owner: PresenceOwner) {
  owner.clientId ??= states.keys().next().value;
  for (const clientId of [...states.keys()]) if (clientId !== owner.clientId) states.delete(clientId);
  for (const clientId of [...removed]) if (clientId !== owner.clientId) removed.delete(clientId);
  const state = owner.clientId === undefined ? undefined : states.get(owner.clientId);
  if (!state) return;
  const sent = state.campuss as { cursor?: unknown } | undefined;
  states.set(owner.clientId!, { campuss: { id: owner.userId, name: owner.name, cursor: cursorOf(sent?.cursor) } });
}

export function canOpenConnection(open: number) {
  return open < MAX_CONNECTIONS_PER_ACCOUNT;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NOTES_PREFIX = "notes:";

/** Une salle de révision porte l'identifiant de l'espace ; une salle de notes, celui du document, avec un préfixe. */
export function parseRoom(name: unknown): { kind: "revision" | "notes"; id: string } | null {
  if (typeof name !== "string") return null;
  if (UUID.test(name)) return { kind: "revision", id: name };
  const id = name.startsWith(NOTES_PREFIX) ? name.slice(NOTES_PREFIX.length) : "";
  return UUID.test(id) ? { kind: "notes", id } : null;
}

export const notesRoom = (documentId: string) => `${NOTES_PREFIX}${documentId}`;

const COLORS = ["#a10e2f", "#2563eb", "#15803d", "#7e22ce", "#c2410c", "#be185d", "#0e7490", "#4d7c0f"];
export const presenceColor = (id: string) => COLORS[[...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length];

const MAX_CURSOR_JSON = 2048;

/** Le curseur de l'éditeur : deux positions relatives Yjs, opaques ici, mais de taille bornée. */
function editorCursorOf(value: unknown) {
  const cursor = value as { anchor?: unknown; head?: unknown } | null | undefined;
  if (!cursor || typeof cursor !== "object" || typeof cursor.anchor !== "object" || typeof cursor.head !== "object") return null;
  const kept = { anchor: cursor.anchor, head: cursor.head };
  return JSON.stringify(kept).length <= MAX_CURSOR_JSON ? kept : null;
}

/** Pour les notes : même règle que imposePresence, avec le format attendu par le curseur de l'éditeur. Le nom affiché vient de la session. */
export function imposeNotesPresence(states: Map<number, Record<string, unknown>>, removed: Set<number>, owner: PresenceOwner) {
  owner.clientId ??= states.keys().next().value;
  for (const clientId of [...states.keys()]) if (clientId !== owner.clientId) states.delete(clientId);
  for (const clientId of [...removed]) if (clientId !== owner.clientId) removed.delete(clientId);
  const state = owner.clientId === undefined ? undefined : states.get(owner.clientId);
  if (!state) return;
  states.set(owner.clientId!, { user: { name: owner.name, color: presenceColor(owner.userId) }, campuss: { id: owner.userId, name: owner.name }, cursor: editorCursorOf(state.cursor) });
}
