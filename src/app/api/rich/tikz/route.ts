import { NextRequest } from "next/server";
import { z } from "zod";
import { apiMember } from "@/lib/auth";
import { json } from "@/lib/http";
import { MAX_TIKZ_CHARS } from "@/lib/rich/tikz";
import { cachedTikz, renderTikz } from "@/lib/rich/tikz-server";
import { QueueFullError, QueueTimeoutError } from "@/lib/serial-queue";
import { rateHit, rateLimited } from "@/lib/security";

const body = z.object({ source: z.string().min(1).max(MAX_TIKZ_CHARS) });

/**
 * SVG d'une figure TikZ, pour l'aperçu de l'éditeur et pour une figure pas encore en cache.
 * Un compte connecté seulement ; une figure déjà rendue ne coûte rien, un nouveau rendu passe par la limite de débit.
 */
export async function POST(request: NextRequest) {
  const user = await apiMember();
  if (!user || user.mustChangePassword) return json({ error: "Accès refusé" }, 403);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Figure trop longue ou vide." }, 400);
  const cached = await cachedTikz(parsed.data.source);
  if (cached) return cached.ok ? json({ svg: cached.svg }) : json({ error: cached.error }, 422);
  const key = `tikz:${user.id}`;
  if (await rateLimited(key, 60, 60)) return json({ error: "Trop de figures calculées. Réessaie dans un moment." }, 429);
  await rateHit(key);
  try {
    const result = await renderTikz(parsed.data.source);
    return result.ok ? json({ svg: result.svg }) : json({ error: result.error }, 422);
  } catch (error) {
    if (error instanceof QueueFullError || error instanceof QueueTimeoutError) return json({ error: "Beaucoup de figures en cours de calcul. Réessaie dans un moment." }, 503);
    throw error;
  }
}
