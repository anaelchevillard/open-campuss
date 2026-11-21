import "server-only";
import { aiAvailable } from "@/lib/ai-available";
import { env } from "@/lib/env";
import type { Organization } from "@/lib/organization-text";

/** Texte brut UTF-8, gardé une heure : le contenu ne change qu'avec le code ou l'activation de Campuss IA. */
export async function llmsResponse(render: (options: { baseUrl: string; ai: boolean; org: Organization }) => string): Promise<Response> {
  // Base indisponible : on décrit le site sans Campuss IA plutôt que d'échouer
  const ai = await aiAvailable().catch(() => false);
  return new Response(render({ baseUrl: env.baseUrl, ai, org: env.organization }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
