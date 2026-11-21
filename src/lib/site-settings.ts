import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { TtlCache } from "@/lib/ttl-cache";

/**
 * Réglages du site modifiables depuis l'administration, avec repli sur app.env quand rien n'est enregistré.
 * Les secrets (clés d'API, SMTP, OAuth) restent dans app.env et n'apparaissent jamais ici.
 */
type Defaults = {
  "registration.mode": "open" | "invite" | "closed";
  "registration.autoApproveDomains": string[];
  // Autres domaines admis à l'inscription publique, avec validation par l'équipe
  "registration.reviewedDomains": string[];
  "registration.blockedDomains": string[];
  "registration.closedMessage": string;
  "quotas.storageMb": number;
  "quotas.aiDailyGlobal": number;
  "mail.dailyLimit": number;
  "features.ai": boolean;
  "features.imports": boolean;
  "features.ranking": boolean;
  "features.duels": boolean;
  "features.groups": boolean;
  "features.bannerImages": boolean;
  "moderation.reportHideThreshold": number;
  "moderation.bannedWords": string[];
};
export type SettingKey = keyof Defaults;
export type FeatureName = "ai" | "imports" | "ranking" | "duels" | "groups" | "bannerImages";

const DEFAULTS: { [K in SettingKey]: () => Defaults[K] } = {
  "registration.mode": () => "open",
  "registration.autoApproveDomains": () => env.autoApproveDomains,
  "registration.reviewedDomains": () => [],
  "registration.blockedDomains": () => [],
  "registration.closedMessage": () => "",
  "quotas.storageMb": () => Math.round(env.storageQuotaBytes / 1024 / 1024),
  "quotas.aiDailyGlobal": () => 500,
  "mail.dailyLimit": () => 300,
  "features.ai": () => true,
  "features.imports": () => true,
  "features.ranking": () => true,
  "features.duels": () => true,
  "features.groups": () => true,
  "features.bannerImages": () => true,
  "moderation.reportHideThreshold": () => env.reportHideThreshold,
  "moderation.bannedWords": () => [],
};

export const SETTING_KEYS = Object.keys(DEFAULTS) as SettingKey[];

// Lu à chaque page (navigation, IA) : gardé une minute, effacé à l'écriture
const cache = new TtlCache<Map<string, unknown>>(1, 60_000);

async function all() {
  return cache.getOrLoad("all", async () => new Map((await db.select().from(schema.siteSettings)).map((row) => [row.key, row.value])));
}

function valid<K extends SettingKey>(key: K, value: unknown): value is Defaults[K] {
  const fallback = DEFAULTS[key]();
  if (Array.isArray(fallback)) return Array.isArray(value) && value.every((v) => typeof v === "string");
  if (key === "registration.mode") return value === "open" || value === "invite" || value === "closed";
  return typeof value === typeof fallback;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Defaults[K]> {
  const stored = (await all().catch(() => new Map<string, unknown>())).get(key);
  return stored !== undefined && valid(key, stored) ? stored : DEFAULTS[key]();
}

/** Écrit un réglage (null = retour à la valeur par défaut). Les droits se vérifient dans l'action qui appelle. */
export async function setSetting<K extends SettingKey>(key: K, value: Defaults[K] | null, by: string | null) {
  if (value === null) await db.delete(schema.siteSettings).where(eq(schema.siteSettings.key, key));
  else {
    if (!valid(key, value)) throw new Error(`réglage invalide : ${key}`);
    await db.insert(schema.siteSettings).values({ key, value, updatedBy: by }).onConflictDoUpdate({ target: schema.siteSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  }
  cache.clear();
}

export async function featureOn(name: FeatureName) {
  return getSetting(`features.${name}` as `features.${FeatureName}`);
}
