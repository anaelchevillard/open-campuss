import { eq } from "drizzle-orm";
import { clientIp } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { notFoundResponse } from "@/lib/http";
import { setMailScope } from "@/lib/notification-state";
import { parseUnsubscribeToken, rateTake } from "@/lib/security";

/**
 * Désinscription en un clic (RFC 8058) : la messagerie envoie « List-Unsubscribe=One-Click » en POST, sans session
 * ni cookie. Le jeton signé désigne une personne et un type de mail ; il ne peut rien faire d'autre que le couper.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/desabonnement/[token]">) {
  if (!(await rateTake(`unsubscribe-ip:${await clientIp()}`, 60, 10))) return new Response("Trop de demandes", { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" } });
  const parsed = parseUnsubscribeToken((await params).token);
  if (!parsed) return notFoundResponse();
  const [person] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, parsed.userId));
  if (!person) return notFoundResponse();
  // Le corps n'est pas lu : un POST sur cette adresse vaut désinscription, quel qu'en soit le contenu
  await setMailScope(parsed.userId, parsed.scope, false);
  return new Response("Désinscription enregistrée.", { status: 200, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

/** Ouvert dans un navigateur : la page de désinscription, qui confirme et permet de revenir en arrière. */
export async function GET(_request: Request, { params }: RouteContext<"/api/desabonnement/[token]">) {
  return Response.redirect(`${env.baseUrl}/desabonnement/${encodeURIComponent((await params).token)}`, 303);
}
