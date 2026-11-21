import "server-only";
import { and, asc, count, desc, eq, exists, gt, ilike, inArray, isNotNull, isNull, lt, not, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "./db";
import { domainVerdict, type DomainVerdict } from "./domains";
import { getSetting } from "./site-settings";

const { users, passkeys } = schema;
export const PEOPLE_PAGE = 50;
export type PeopleTab = "tous" | "attente" | "suspendus" | "staff";

const list = (value: string | undefined) => (value ? value.split(",").filter(Boolean) : []);
const nums = (value: string | undefined) => list(value).map(Number).filter((n) => Number.isInteger(n) && n > 0);

function tabWhere(tab: PeopleTab): SQL | undefined {
  if (tab === "attente") return eq(users.status, "pending");
  if (tab === "suspendus") return or(gt(users.suspendedUntil, new Date()), inArray(users.status, ["banned", "disabled"]));
  if (tab === "staff") return inArray(users.role, ["admin", "delegate", "teacher"]);
  return undefined;
}

const secondFactor = or(eq(users.totpEnabled, true), exists(db.select({ x: sql`1` }).from(passkeys).where(eq(passkeys.userId, users.id))));

/** Personnes de la grille : recherche, filtres, tri et pagination côté serveur, à partir des paramètres d'URL. */
export async function listPeople(p: Record<string, string | undefined>, programId: number | null) {
  const tab = (["tous", "attente", "suspendus", "staff"].includes(p.onglet ?? "") ? p.onglet : "tous") as PeopleTab;
  const q = p.q?.trim().slice(0, 80);
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
  const code = q?.replace(/[\s-]/g, "").toUpperCase();
  const programs = nums(p.licence).length ? nums(p.licence) : programId ? [programId] : [];
  const inactive = Number(p.inactif);
  const filters = and(
    like ? or(ilike(users.name, like), ilike(users.email, like), code && /^[0-9A-F]{6,10}$/.test(code) ? eq(users.friendCode, code) : undefined) : undefined,
    list(p.etat).length ? inArray(users.status, list(p.etat) as never[]) : undefined,
    list(p.role).length ? inArray(users.role, list(p.role) as never[]) : undefined,
    programs.length ? inArray(users.programId, programs) : undefined,
    nums(p.annee).length ? inArray(users.level, nums(p.annee)) : undefined,
    p["2fa"] === "oui" ? secondFactor : p["2fa"] === "non" ? not(secondFactor!) : undefined,
    p.jamais === "oui" ? isNull(users.lastLoginAt) : undefined,
    inactive > 0 ? lt(sql`coalesce(${users.lastLoginAt}, ${users.createdAt})`, new Date(Date.now() - inactive * 86_400_000)) : undefined,
    list(p.invitepar).length ? inArray(users.invitedBy, list(p.invitepar)) : undefined,
  );
  const sorts: Record<string, SQL | typeof users.name> = { nom: users.name, inscription: users.createdAt as never, connexion: sql`${users.lastLoginAt} nulls last`, licence: users.programId as never };
  const sortCol = sorts[p.tri ?? ""] ?? null;
  const order = sortCol ? (p.sens === "asc" ? asc(sortCol as never) : desc(sortCol as never)) : tab === "attente" ? asc(users.createdAt) : desc(users.createdAt);
  const page = Math.max(1, Number(p.page) || 1);
  const where = and(filters, tabWhere(tab));
  const [rows, [{ n: total }], tabCounts, approved] = await Promise.all([
    db.select({
      id: users.id, name: users.name, email: users.email, status: users.status, role: users.role, programId: users.programId, level: users.level, avatarKey: users.avatarKey,
      createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, suspendedUntil: users.suspendedUntil, message: users.message, isOwner: users.isOwner, totpEnabled: users.totpEnabled,
      deletionScheduledAt: users.deletionScheduledAt,
    }).from(users).where(where).orderBy(order).limit(PEOPLE_PAGE).offset((page - 1) * PEOPLE_PAGE),
    db.select({ n: count() }).from(users).where(where),
    Promise.all((["attente", "suspendus", "staff"] as const).map(async (t) => [t, (await db.select({ n: count() }).from(users).where(and(filters, tabWhere(t))))[0].n] as const)),
    getSetting("registration.autoApproveDomains"),
  ]);
  return {
    tab, page, total,
    counts: Object.fromEntries(tabCounts) as Record<"attente" | "suspendus" | "staff", number>,
    rows: rows.map((r) => ({ ...r, domain: r.status === "pending" ? domainVerdict(r.email, approved) : null as DomainVerdict | null, suspended: Boolean(r.suspendedUntil && r.suspendedUntil > new Date()) })),
  };
}
export type PersonRow = Awaited<ReturnType<typeof listPeople>>["rows"][number];

export async function inviters() {
  return db.selectDistinct({ id: users.id, name: users.name }).from(users).where(and(inArray(users.id, db.select({ id: users.invitedBy }).from(users).where(isNotNull(users.invitedBy)))));
}
