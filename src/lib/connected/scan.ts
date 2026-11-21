import "server-only";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { notify } from "../notify";
import { openToken, sealToken } from "./oauth-seal";
import { ConnectionLost, type OauthConfig, PROVIDERS, type Root, type Tokens } from "./providers";
import { FOLDERS_PER_TURN, pickNew, type Provider, proposalTitle, SCAN_EVERY_MS, SCAN_RETRY_AFTER_MS, titleFrom } from "./rules";

const { connectedFolders, connectedItems, connectedTokens } = schema;
export type ConnectedFolder = typeof connectedFolders.$inferSelect;

export function oauthConfig(provider: Provider): OauthConfig | null {
  const [clientId, clientSecret] = provider === "google" ? [env.googleOauthClientId, env.googleOauthClientSecret] : [env.notionOauthClientId, env.notionOauthClientSecret];
  return clientId && clientSecret ? { clientId, clientSecret, redirectUri: `${env.baseUrl}/api/connected/${provider}/callback` } : null;
}

export const enabledProviders = () => (["notion", "google"] as const).filter((provider) => oauthConfig(provider));

export async function saveConnection(userId: string, provider: Provider, tokens: Tokens) {
  let label = tokens.label ?? "";
  if (!label) label = await PROVIDERS[provider].accountLabel(tokens.accessToken).catch(() => "");
  const [folder] = await db.insert(connectedFolders).values({ userId, provider, accountLabel: label }).onConflictDoUpdate({ target: [connectedFolders.userId, connectedFolders.provider], set: { brokenAt: null, ...(label ? { accountLabel: label } : {}) } }).returning();
  const sealed = { accessToken: sealToken(tokens.accessToken), refreshToken: tokens.refreshToken ? sealToken(tokens.refreshToken) : null, expiresAt: tokens.expiresAt };
  await db.insert(connectedTokens).values({ folderId: folder.id, userId, ...sealed }).onConflictDoUpdate({ target: connectedTokens.folderId, set: sealed });
  return folder;
}

/** Le jeton valable, renouvelé si besoin. Passe par ici tout ce qui parle au service. */
export async function accessTokenOf(folder: Pick<ConnectedFolder, "id" | "provider">) {
  const [row] = await db.select().from(connectedTokens).where(eq(connectedTokens.folderId, folder.id));
  if (!row) throw new ConnectionLost("aucun jeton");
  const access = openToken(row.accessToken);
  if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 60_000) return access;
  const config = oauthConfig(folder.provider);
  if (!config || !row.refreshToken) throw new ConnectionLost("renouvellement impossible");
  const fresh = await PROVIDERS[folder.provider].refresh(config, openToken(row.refreshToken));
  await db.update(connectedTokens).set({ accessToken: sealToken(fresh.accessToken), refreshToken: fresh.refreshToken ? sealToken(fresh.refreshToken) : null, expiresAt: fresh.expiresAt }).where(eq(connectedTokens.folderId, folder.id));
  return fresh.accessToken;
}

async function markBroken(folder: ConnectedFolder) {
  await db.update(connectedFolders).set({ brokenAt: new Date() }).where(eq(connectedFolders.id, folder.id));
  await notify(folder.userId, { kind: "connected_folder", title: "Ton compte connecté n’est plus accessible", body: "Reconnecte-le pour retrouver tes notes.", href: "/parametres/comptes-connectes" });
}

/** Ajoute les nouveautés, dans la limite d'un passage. Renvoie leur nombre. */
export async function scanFolder(folder: ConnectedFolder) {
  const token = await accessTokenOf(folder);
  const root: Root | null = folder.folderId ? { id: folder.folderId, name: folder.folderName } : null;
  // Un ancien dossier relié reste lu tel quel ; sinon, les pages modifiées depuis le dernier passage
  const found = root
    ? await PROVIDERS[folder.provider].listItems(token, root)
    : (await PROVIDERS[folder.provider].search(token, "", null)).items
      .filter((item) => !folder.lastCheckedAt || (item.editedAt ?? 0) > folder.lastCheckedAt.getTime())
      .map((item) => ({ id: item.id, title: item.title, mime: item.mime, modifiedAt: item.editedAt ?? 0 }));
  const known = found.length ? await db.select({ id: connectedItems.externalId }).from(connectedItems).where(and(eq(connectedItems.folderId, folder.id), inArray(connectedItems.externalId, found.map((item) => item.id)))) : [];
  const fresh = pickNew(found, new Set(known.map((row) => row.id)));
  if (fresh.length) await db.insert(connectedItems).values(fresh.map((item) => ({ folderId: folder.id, externalId: item.id, title: titleFrom(item.title), mime: item.mime.slice(0, 120) }))).onConflictDoNothing();
  await db.update(connectedFolders).set({ lastCheckedAt: new Date() }).where(eq(connectedFolders.id, folder.id));
  return fresh.length;
}

/** Quelques dossiers à chaque tour : la boucle de fond sert aussi aux mails et aux imports. */
export async function scanDueFolders(now = Date.now()) {
  if (!enabledProviders().length) return;
  const due = await db.select().from(connectedFolders)
    .where(and(eq(connectedFolders.weekly, true), isNull(connectedFolders.brokenAt), or(isNull(connectedFolders.lastCheckedAt), lt(connectedFolders.lastCheckedAt, new Date(now - SCAN_EVERY_MS)))))
    .orderBy(asc(connectedFolders.lastCheckedAt)).limit(FOLDERS_PER_TURN);
  for (const folder of due) {
    try {
      const count = await scanFolder(folder);
      if (count) await notify(folder.userId, { kind: "connected_folder", title: proposalTitle(count), href: "/parametres/comptes-connectes" });
    } catch (error) {
      if (error instanceof ConnectionLost) await markBroken(folder);
      else {
        // Panne passagère : on réessaie demain, sans bloquer les dossiers suivants
        console.warn("dossier connecté :", (error as Error).message);
        await db.update(connectedFolders).set({ lastCheckedAt: new Date(now - SCAN_EVERY_MS + SCAN_RETRY_AFTER_MS) }).where(eq(connectedFolders.id, folder.id));
      }
    }
  }
}

/** Efface toujours de notre côté. Renvoie false si le service n'a pas confirmé la révocation. */
export async function disconnectFolder(folder: Pick<ConnectedFolder, "id" | "provider">) {
  const [row] = await db.select().from(connectedTokens).where(eq(connectedTokens.folderId, folder.id));
  const config = oauthConfig(folder.provider);
  let revoked = false;
  if (row && config) {
    try {
      // Révoquer le jeton de renouvellement retire tout l'accès chez Google
      revoked = await PROVIDERS[folder.provider].revoke(config, openToken(row.refreshToken ?? row.accessToken));
    } catch (error) {
      console.warn("dossier connecté, révocation :", (error as Error).message);
    }
  }
  await db.delete(connectedFolders).where(eq(connectedFolders.id, folder.id));
  return revoked;
}

export async function revokeAllConnections(userId: string) {
  for (const folder of await db.select({ id: connectedFolders.id, provider: connectedFolders.provider }).from(connectedFolders).where(eq(connectedFolders.userId, userId))) await disconnectFolder(folder);
}
