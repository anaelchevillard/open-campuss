import { type Found, isGoogleDoc, isImportable, MAX_CONTAINERS, MAX_DEPTH, MAX_FILE_BYTES, MAX_LISTED, type Provider } from "./rules";

export type OauthConfig = { clientId: string; clientSecret: string; redirectUri: string };
export type Tokens = { accessToken: string; refreshToken: string | null; expiresAt: Date | null; label?: string };
/** Une page ou un document proposé dans le sélecteur. */
export type Picked = { id: string; title: string; editedAt: number | null; icon: string | null; mime: string };
export type PickedPage = { items: Picked[]; next: string | null };
export type Root = { id: string; name: string };
export type Fetcher = typeof fetch;

/** Accès refusé par le service : le jeton n'est plus bon, il faut reconnecter. */
export class ConnectionLost extends Error {}

const TIMEOUT = 20_000;
const SAFE_ID = /^[\w-]{1,100}$/;
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 401 || response.status === 403) throw new ConnectionLost(`accès refusé (${response.status})`);
  if (!response.ok) throw new Error(`réponse ${response.status}`);
  return await response.json() as T;
}

const tokensFrom = (body: { access_token?: string; refresh_token?: string; expires_in?: number }, kept: string | null = null): Tokens => {
  if (!body.access_token) throw new Error("réponse sans jeton");
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? kept, expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : null };
};

const basic = (config: OauthConfig) => `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;

export type ConnectedProvider = {
  authorizeUrl(config: OauthConfig, state: string): string;
  exchange(config: OauthConfig, code: string, http?: Fetcher): Promise<Tokens>;
  refresh(config: OauthConfig, refreshToken: string, http?: Fetcher): Promise<Tokens>;
  revoke(config: OauthConfig, token: string, http?: Fetcher): Promise<boolean>;
  listRoots(token: string, http?: Fetcher): Promise<Root[]>;
  listItems(token: string, root: Root, http?: Fetcher): Promise<Found[]>;
  /** Le plus récemment modifié d'abord, 25 par page : la recherche du sélecteur et la proposition de la semaine. */
  search(token: string, query: string, cursor: string | null, http?: Fetcher): Promise<PickedPage>;
  /** L'adresse ou le nom de l'espace, pour que l'étudiant sache quel compte est relié. */
  accountLabel(token: string, http?: Fetcher): Promise<string>;
};

export const PAGE_SIZE = 25;
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const cleanQuery = (query: string) => query.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 100);
const SAFE_CURSOR = /^[\w\-.~=+/]{1,500}$/;

const google: ConnectedProvider = {
  authorizeUrl(config, state) {
    // offline et consent : sans jeton de renouvellement, la tâche hebdomadaire ne tournerait qu'une heure
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: GOOGLE_SCOPE, access_type: "offline", prompt: "consent", state })}`;
  },
  async exchange(config, code, http = fetch) {
    const response = await http("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(TIMEOUT), body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }) });
    return tokensFrom(await readJson(response));
  },
  async refresh(config, refreshToken, http = fetch) {
    const response = await http("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(TIMEOUT), body: new URLSearchParams({ refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" }) });
    // invalid_grant : l'étudiant a retiré l'accès depuis son compte Google
    if (response.status === 400) throw new ConnectionLost("renouvellement refusé");
    return tokensFrom(await readJson(response), refreshToken);
  },
  async revoke(_, token, http = fetch) {
    const response = await http("https://oauth2.googleapis.com/revoke", { method: "POST", signal: AbortSignal.timeout(TIMEOUT), body: new URLSearchParams({ token }) });
    return response.ok;
  },
  async listRoots(token, http = fetch) {
    const query = new URLSearchParams({ q: `mimeType='${FOLDER}' and trashed=false`, orderBy: "modifiedTime desc", pageSize: "100", fields: "files(id,name)" });
    const body = await readJson<{ files?: { id: string; name: string }[] }>(await http(`${GOOGLE_API}/files?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) }));
    return (body.files ?? []).filter((file) => SAFE_ID.test(file.id)).map((file) => ({ id: file.id, name: file.name }));
  },
  async listItems(token, root, http = fetch) {
    const found: Found[] = [];
    const queue = [{ id: root.id, depth: 0 }];
    let visited = 0;
    while (queue.length && visited < MAX_CONTAINERS && found.length < MAX_LISTED) {
      const folder = queue.shift()!;
      visited++;
      // L'identifiant entre dans une requête : seul ce format y passe. C'est ici que l'accès se restreint au dossier relié.
      if (!SAFE_ID.test(folder.id)) continue;
      const query = new URLSearchParams({ q: `'${folder.id}' in parents and trashed=false`, orderBy: "modifiedTime desc", pageSize: "100", fields: "files(id,name,mimeType,modifiedTime,size)" });
      const body = await readJson<{ files?: { id: string; name: string; mimeType: string; modifiedTime: string; size?: string }[] }>(await http(`${GOOGLE_API}/files?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) }));
      for (const file of body.files ?? []) {
        if (!SAFE_ID.test(file.id)) continue;
        if (file.mimeType === FOLDER) { if (folder.depth + 1 < MAX_DEPTH) queue.push({ id: file.id, depth: folder.depth + 1 }); continue; }
        if (!isImportable(file.mimeType) || Number(file.size ?? 0) > MAX_FILE_BYTES) continue;
        found.push({ id: file.id, title: file.name, mime: file.mimeType, modifiedAt: Date.parse(file.modifiedTime) || 0 });
      }
    }
    return found.slice(0, MAX_LISTED);
  },
  async search(token, query, cursor, http = fetch) {
    const words = cleanQuery(query);
    // Syntaxe de requête de Drive : l'apostrophe et la barre oblique inverse s'échappent
    const name = words ? ` and name contains '${words.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'` : "";
    const params = new URLSearchParams({ q: `mimeType='${GOOGLE_DOC_MIME}' and trashed=false${name}`, orderBy: "modifiedTime desc", pageSize: String(PAGE_SIZE), fields: "nextPageToken,files(id,name,modifiedTime)" });
    if (cursor && SAFE_CURSOR.test(cursor)) params.set("pageToken", cursor);
    const body = await readJson<{ nextPageToken?: string; files?: { id: string; name: string; modifiedTime?: string }[] }>(await http(`${GOOGLE_API}/files?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) }));
    return {
      items: (body.files ?? []).filter((file) => SAFE_ID.test(file.id)).map((file) => ({ id: file.id, title: file.name.trim() || "Sans titre", editedAt: Date.parse(file.modifiedTime ?? "") || null, icon: null, mime: GOOGLE_DOC_MIME })),
      next: body.nextPageToken ?? null,
    };
  },
  async accountLabel(token, http = fetch) {
    const body = await readJson<{ user?: { emailAddress?: string; displayName?: string } }>(await http(`${GOOGLE_API}/about?fields=user(emailAddress,displayName)`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) }));
    return (body.user?.emailAddress ?? body.user?.displayName ?? "").slice(0, 200);
  },
};

/** S'arrête dès que le fichier dépasse la limite, même si le service annonçait une taille plus petite ou aucune. */
async function boundedBytes(response: Response) {
  if (response.status === 401 || response.status === 403) throw new ConnectionLost(`accès refusé (${response.status})`);
  if (!response.ok || !response.body) throw new Error(`réponse ${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_FILE_BYTES) throw new FileTooLarge();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_FILE_BYTES) { await reader.cancel(); throw new FileTooLarge(); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export class FileTooLarge extends Error {}

export async function downloadGoogleFile(token: string, id: string, mime: string, http: Fetcher = fetch) {
  if (!SAFE_ID.test(id)) throw new Error("identifiant invalide");
  const url = isGoogleDoc(mime)
    ? `${GOOGLE_API}/files/${id}/export?${new URLSearchParams({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })}`
    : `${GOOGLE_API}/files/${id}?alt=media`;
  return boundedBytes(await http(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) }));
}

const notionHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" });

const pageTitle = (page: { properties?: Record<string, { type?: string; title?: { plain_text?: string }[] }> }) => {
  const property = Object.values(page.properties ?? {}).find((p) => p.type === "title");
  return property?.title?.map((t) => t.plain_text ?? "").join("").trim() || "Sans titre";
};

const notion: ConnectedProvider = {
  authorizeUrl(config, state) {
    // La portée se choisit dans la fenêtre de Notion : l'étudiant coche les pages qu'il partage, rien d'autre n'est visible
    return `https://api.notion.com/v1/oauth/authorize?${new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", owner: "user", state })}`;
  },
  async exchange(config, code, http = fetch) {
    const response = await http(`${NOTION_API}/oauth/token`, { method: "POST", signal: AbortSignal.timeout(TIMEOUT), headers: { Authorization: basic(config), "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri }) });
    const body = await readJson<{ access_token?: string; refresh_token?: string; expires_in?: number; workspace_name?: string | null; owner?: { user?: { person?: { email?: string } } } }>(response);
    const tokens = tokensFrom(body);
    // L'espace dit mieux que l'adresse ce qui est relié : on garde l'adresse en repli
    const label = (body.workspace_name || body.owner?.user?.person?.email || "").slice(0, 200);
    return label ? { ...tokens, label } : tokens;
  },
  async refresh(config, refreshToken, http = fetch) {
    const response = await http(`${NOTION_API}/oauth/token`, { method: "POST", signal: AbortSignal.timeout(TIMEOUT), headers: { Authorization: basic(config), "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }) });
    if (response.status === 400) throw new ConnectionLost("renouvellement refusé");
    return tokensFrom(await readJson(response), refreshToken);
  },
  async revoke(config, token, http = fetch) {
    const response = await http(`${NOTION_API}/oauth/revoke`, { method: "POST", signal: AbortSignal.timeout(TIMEOUT), headers: { Authorization: basic(config), "Content-Type": "application/json", "Notion-Version": NOTION_VERSION }, body: JSON.stringify({ token }) });
    return response.ok;
  },
  async listRoots(token, http = fetch) {
    const body = await readJson<{ results?: { id: string; properties?: Record<string, { type?: string; title?: { plain_text?: string }[] }> }[] }>(await http(`${NOTION_API}/search`, { method: "POST", headers: notionHeaders(token), signal: AbortSignal.timeout(TIMEOUT), body: JSON.stringify({ filter: { property: "object", value: "page" }, page_size: 100 }) }));
    return (body.results ?? []).map((page) => ({ id: page.id, name: pageTitle(page) }));
  },
  async listItems(token, root, http = fetch) {
    const found: Found[] = [];
    const queue = [{ id: root.id, depth: 0 }];
    let visited = 0;
    while (queue.length && visited < MAX_CONTAINERS && found.length < MAX_LISTED) {
      const page = queue.shift()!;
      visited++;
      if (!/^[\w-]{1,100}$/.test(page.id)) continue;
      const body = await readJson<{ results?: { id: string; type: string; last_edited_time?: string; child_page?: { title?: string } }[] }>(await http(`${NOTION_API}/blocks/${page.id}/children?page_size=100`, { headers: notionHeaders(token), signal: AbortSignal.timeout(TIMEOUT) }));
      for (const block of body.results ?? []) {
        if (block.type !== "child_page") continue;
        found.push({ id: block.id, title: block.child_page?.title?.trim() || "Sans titre", mime: "notion", modifiedAt: Date.parse(block.last_edited_time ?? "") || 0 });
        if (page.depth + 1 < MAX_DEPTH) queue.push({ id: block.id, depth: page.depth + 1 });
      }
    }
    // Une page sans sous-page : c'est elle, la note
    return found.length ? found.slice(0, MAX_LISTED) : [{ id: root.id, title: root.name, mime: "notion", modifiedAt: 0 }];
  },
  async search(token, query, cursor, http = fetch) {
    const words = cleanQuery(query);
    const request = { filter: { property: "object", value: "page" }, sort: { direction: "descending", timestamp: "last_edited_time" }, page_size: PAGE_SIZE, ...(words ? { query: words } : {}), ...(cursor && SAFE_CURSOR.test(cursor) ? { start_cursor: cursor } : {}) };
    const body = await readJson<{ next_cursor?: string | null; results?: { id: string; last_edited_time?: string; in_trash?: boolean; archived?: boolean; icon?: { type?: string; emoji?: string } | null; properties?: Record<string, { type?: string; title?: { plain_text?: string }[] }> }[] }>(await http(`${NOTION_API}/search`, { method: "POST", headers: notionHeaders(token), signal: AbortSignal.timeout(TIMEOUT), body: JSON.stringify(request) }));
    return {
      items: (body.results ?? []).filter((page) => SAFE_ID.test(page.id) && !page.in_trash && !page.archived).map((page) => ({ id: page.id, title: pageTitle(page), editedAt: Date.parse(page.last_edited_time ?? "") || null, icon: page.icon?.type === "emoji" && page.icon.emoji ? page.icon.emoji.slice(0, 8) : null, mime: "notion" })),
      next: body.next_cursor ?? null,
    };
  },
  async accountLabel() {
    // Notion le donne à l'échange du code (workspace_name) : rien à redemander
    return "";
  },
};

export const PROVIDERS: Record<Provider, ConnectedProvider> = { google, notion };
export const PROVIDER_NAMES: Record<Provider, string> = { google: "Google Docs", notion: "Notion" };
