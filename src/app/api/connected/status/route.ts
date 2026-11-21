import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { canEdit, isDocAuthor } from "@/lib/access-server";
import { aiAvailable } from "@/lib/ai-available";
import { aiUsage } from "@/lib/ai-quota-server";
import { acceptedCategories } from "@/lib/attest-server";
import { apiMember } from "@/lib/auth";
import { accountsOf } from "@/lib/connected/status";
import { db, schema } from "@/lib/db";
import { json } from "@/lib/http";
import { featureOn } from "@/lib/site-settings";

/**
 * Ce que les tuiles « Commencer avec… » d'un brouillon peuvent proposer. Comme la route de transcription :
 * la photo sur ses propres brouillons non publiés, et partout pour un administrateur.
 */
export async function GET(request: NextRequest) {
  const user = await apiMember();
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("doc"));
  if (!user) return json({ error: "Accès refusé" }, 403);
  const [doc] = id.success ? await db.select().from(schema.documents).where(eq(schema.documents.id, id.data)) : [];
  if (id.success && (!doc || !(await canEdit(user, doc)))) return json({ error: "Accès refusé" }, 403);
  const [ai, files, accounts] = await Promise.all([aiAvailable(), featureOn("imports"), accountsOf(user.id)]);
  const mine = doc ? user.role === "admin" || (!doc.published && (await isDocAuthor(user.id, doc))) : true;
  const ocr = ai && mine;
  return json({
    ocr,
    ocrAccepted: ocr && (await acceptedCategories(user.id, "ocr")).length > 0,
    pagesLeft: ocr ? (await aiUsage(user)).left.pages : null,
    files,
    accounts: accounts.map(({ provider, name, connected, broken, label }) => ({ provider, name, connected, broken, label })),
  });
}
