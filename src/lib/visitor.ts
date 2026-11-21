import { isIP } from "node:net";

/**
 * L'adresse d'un visiteur. L'en-tête de confiance n'est lu que s'il a été activé, car n'importe qui peut l'écrire tant que
 * Traefik n'est pas limité aux adresses de Cloudflare. Sinon : la dernière entrée de X-Forwarded-For, celle posée par Traefik.
 */
export function visitorAddress(get: (name: string) => string | null, trustedHeader: string) {
  const trusted = trustedHeader ? get(trustedHeader)?.trim() ?? "" : "";
  if (trusted && isIP(trusted)) return trusted;
  const forwarded = get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "";
  return isIP(forwarded) ? forwarded : "";
}
