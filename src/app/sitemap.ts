import type { MetadataRoute } from "next";
import { isDemo } from "@/lib/demo";
import { env } from "@/lib/env";
import { INDEXABLE_PAGES } from "@/lib/indexable";

// Lu à chaque requête : l'adresse du site et le mode démonstration viennent de l'environnement, pas du build
export const dynamic = "force-dynamic";

/** Les seules pages indexables (src/lib/indexable.ts) ; jamais un cours, un partage ni une page connectée. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (isDemo()) return [];
  return INDEXABLE_PAGES.map((page) => ({
    url: `${env.baseUrl}${page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    alternates: { languages: { fr: `${env.baseUrl}${page.path}` } },
  }));
}
