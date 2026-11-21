import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { featureOn } from "../site-settings";
import { PROVIDER_NAMES } from "./providers";
import type { Provider } from "./rules";
import { enabledProviders } from "./scan";

const { connectedFolders } = schema;

/** Ce que voit l'étudiant d'un service : rien de secret, rien qui ne serve pas à l'interface. */
export type Account = { provider: Provider; name: string; connected: boolean; broken: boolean; label: string; weekly: boolean };

/** Un service sans clé, ou des imports coupés par l'administration : il n'existe pas (rien de grisé). */
export async function importProviders(): Promise<Provider[]> {
  const enabled = enabledProviders();
  return enabled.length && (await featureOn("imports")) ? enabled : [];
}

export async function accountsOf(userId: string, providers?: Provider[]): Promise<Account[]> {
  const list = providers ?? (await importProviders());
  if (!list.length) return [];
  const rows = await db.select({ provider: connectedFolders.provider, brokenAt: connectedFolders.brokenAt, label: connectedFolders.accountLabel, weekly: connectedFolders.weekly }).from(connectedFolders).where(eq(connectedFolders.userId, userId));
  return list.map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    return { provider, name: PROVIDER_NAMES[provider], connected: Boolean(row), broken: Boolean(row?.brokenAt), label: row?.label ?? "", weekly: row?.weekly ?? false };
  });
}

export async function folderOf(userId: string, provider: Provider) {
  const [folder] = await db.select().from(connectedFolders).where(and(eq(connectedFolders.userId, userId), eq(connectedFolders.provider, provider)));
  return folder ?? null;
}
