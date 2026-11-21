import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { canEdit, isDocAuthor } from "@/lib/access-server";
import { suggestDetails } from "@/lib/ai-suggest";
import { apiMember } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { json } from "@/lib/http";

const body = z.object({ filename: z.string().max(300).default("") });

/**
 * Le texte vient de la base, jamais du navigateur : cette route ne peut pas servir de relais vers l'IA.
 * Une route et non une action : les actions passent une par une, et celle-ci retiendrait l'enregistrement automatique.
 */
export async function POST(request: NextRequest) {
  const user = await apiMember();
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("doc"));
  if (!user || !id.success) return json({ error: "Accès refusé" }, 403);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id.data));
  if (!doc || doc.published || !(await canEdit(user, doc)) || !(await isDocAuthor(user.id, doc))) return json({ error: "Accès refusé" }, 403);
  const parsed = body.safeParse(await request.json().catch(() => null));
  return json({ suggestion: await suggestDetails(user, doc, parsed.success ? parsed.data.filename : "") });
}
