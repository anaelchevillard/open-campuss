import type { MetadataRoute } from "next";
import { isDemo } from "@/lib/demo";
import { env } from "@/lib/env";

// Lu à chaque requête : l'adresse du site et le mode démonstration viennent de l'environnement, pas du build
export const dynamic = "force-dynamic";

/**
 * Exploration permise partout : un Disallow empêcherait les robots de lire le noindex des autres pages, qui pourraient
 * alors apparaître sans contenu. Seules les pages de src/lib/indexable.ts s'indexent (next.config.ts et leurs métadonnées).
 * Pas de règle par robot d'IA : ils lisent les mêmes pages publiques, et /llms.txt les résume.
 */
export default function robots(): MetadataRoute.Robots {
  // Démonstration : exploration permise (pour lire le noindex de chaque page), mais aucun plan du site
  if (isDemo()) return { rules: { userAgent: "*", allow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${env.baseUrl}/sitemap.xml` };
}
