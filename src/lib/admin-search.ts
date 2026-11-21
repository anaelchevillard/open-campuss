import "server-only";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const ACTIONS = [
  { id: "action:inviter", label: "Inviter", href: "/admin/invitations", hint: "Action", words: ["inviter", "invitation", "invitations", "lien", "qr"] },
  { id: "action:creer", label: "Créer un compte", href: "/admin/personnes?creer=1", hint: "Action", words: ["creer", "créer", "compte", "nouveau"] },
  { id: "action:annonce", label: "Publier une annonce", href: "/admin/annonces", hint: "Action", words: ["annonce", "bandeau", "bannière"] },
  { id: "action:reglages", label: "Réglages du site", href: "/admin/reglages", hint: "Action", words: ["reglages", "réglages", "inscriptions", "fonctions", "quotas"] },
];

/** Recherche de l'administration dans la palette : personnes (nom, adresse, code ami), cours, actions. */
export async function adminSearch(q: string): Promise<{ id: string; label: string; href: string; hint: string }[]> {
  const text = q.trim().slice(0, 80);
  if (text.length < 2) return [];
  const like = `%${text.replace(/[%_\\]/g, "\\$&")}%`;
  const code = text.replace(/[\s-]/g, "").toUpperCase();
  const [people, docs] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users)
      .where(or(ilike(schema.users.name, like), ilike(schema.users.email, like), /^[0-9A-F]{6,10}$/.test(code) ? eq(schema.users.friendCode, code) : undefined)).limit(6),
    db.select({ id: schema.documents.id, title: schema.documents.title }).from(schema.documents).where(and(ilike(schema.documents.title, like), isNull(schema.documents.deletedAt))).limit(5),
  ]);
  const folded = text.toLowerCase();
  return [
    ...ACTIONS.filter((a) => a.words.some((w) => w.startsWith(folded) || folded.startsWith(w))).map((a) => ({ id: a.id, label: a.label, href: a.href, hint: a.hint })),
    ...people.map((p) => ({ id: `user:${p.id}`, label: p.name, href: `/admin/personnes/${p.id}`, hint: p.email })),
    ...docs.map((d) => ({ id: `doc:${d.id}`, label: d.title, href: `/d/${d.id}`, hint: "Cours" })),
  ];
}
