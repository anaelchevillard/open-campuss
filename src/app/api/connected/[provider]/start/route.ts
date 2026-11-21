import { NextRequest } from "next/server";
import { apiMember } from "@/lib/auth";
import { signState } from "@/lib/connected/oauth-seal";
import { PROVIDERS } from "@/lib/connected/providers";
import { CONNECTED_PAGE, isProvider, safeReturnTo } from "@/lib/connected/rules";
import { oauthConfig } from "@/lib/connected/scan";
import { importProviders } from "@/lib/connected/status";
import { notFoundResponse } from "@/lib/http";

/**
 * Un lien et non un formulaire : form-action 'self' bloquerait la redirection vers Google ou Notion.
 * L'adresse de retour voyage dans l'état signé ; une adresse hors liste blanche revient aux comptes connectés.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  // Pendant un « voir comme », aucun dossier ne se relie au compte vu (le proxy le masque déjà)
  const user = await apiMember();
  const { provider } = await params;
  if (!user || user.mustChangePassword || !isProvider(provider) || !(await importProviders()).includes(provider)) return notFoundResponse();
  const config = oauthConfig(provider);
  if (!config) return notFoundResponse();
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("retour")) ?? CONNECTED_PAGE;
  return Response.redirect(PROVIDERS[provider].authorizeUrl(config, signState({ user: user.id, provider, returnTo })), 302);
}
