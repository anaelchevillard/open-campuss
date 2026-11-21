import { NextRequest } from "next/server";
import { audit, apiMember } from "@/lib/auth";
import { verifyState } from "@/lib/connected/oauth-seal";
import { PROVIDERS } from "@/lib/connected/providers";
import { CONNECTED_PAGE, isProvider, type Provider, returnWith } from "@/lib/connected/rules";
import { oauthConfig, saveConnection } from "@/lib/connected/scan";
import { forgetPages } from "@/lib/connected/pages-cache";
import { env } from "@/lib/env";
import { notFoundResponse } from "@/lib/http";
import { rateHit, rateLimited } from "@/lib/security";

/** L'application (campuss://) reçoit l'adresse telle quelle ; un chemin du site devient une adresse complète. */
const back = (target: string, result: string, provider: Provider) => {
  const url = returnWith(target, result, provider);
  return url.startsWith("/") ? Response.redirect(`${env.baseUrl}${url}`, 302) : new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  // Pendant un « voir comme », aucun dossier ne se relie au compte vu (le proxy le masque déjà)
  const user = await apiMember();
  const { provider } = await params;
  const config = isProvider(provider) ? oauthConfig(provider) : null;
  if (!user || !config || !isProvider(provider)) return notFoundResponse();
  const query = request.nextUrl.searchParams;
  const state = verifyState(query.get("state") ?? "");
  // Lié au compte et au service : un lien de retour envoyé à quelqu'un d'autre ne relie pas le compte de l'attaquant à sa victime
  if (!state || state.user !== user.id || state.provider !== provider) return back(CONNECTED_PAGE, "refuse", provider);
  const target = state.returnTo ?? CONNECTED_PAGE;
  const used = `oauth-state:${state.nonce}`;
  if (await rateLimited(used, 1, 15)) return back(target, "refuse", provider);
  await rateHit(used);
  const code = query.get("code");
  if (!code) return back(target, "annule", provider);
  try {
    await saveConnection(user.id, provider, await PROVIDERS[provider].exchange(config, code));
  } catch (error) {
    console.warn("compte connecté, connexion :", (error as Error).message);
    return back(target, "echec", provider);
  }
  forgetPages(user.id, provider);
  await audit(user.email, "dossier_connecté", provider);
  return back(target, "ok", provider);
}
