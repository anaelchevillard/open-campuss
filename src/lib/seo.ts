import type { Metadata } from "next";
import { isDemo } from "@/lib/demo";
import { env } from "@/lib/env";
import type { INDEXABLE_PAGES } from "@/lib/indexable";

export type PublicPath = (typeof INDEXABLE_PAGES)[number]["path"];

export const SITE_NAME = "Campuss";
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "L’accueil de Campuss : les cours d’une licence rangés par matière" };

/**
 * Métadonnées d'une page publique indexable : le layout racine met tout en noindex, chaque page de
 * src/lib/indexable.ts le lève ici, avec son adresse canonique, sa langue et son aperçu de partage.
 */
export function publicMetadata({ path, title, description, absolute }: { path: PublicPath; title: string; description: string; absolute?: boolean }): Metadata {
  const shown = absolute ? title : `${title} – ${SITE_NAME}`;
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path, languages: { fr: path, "x-default": path } },
    robots: isDemo() ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { title: shown, description, url: path, siteName: SITE_NAME, type: "website", locale: "fr_FR", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: shown, description, images: [OG_IMAGE.url] },
  };
}

const ORGANIZATION_ID = () => `${env.baseUrl}/#organisation`;

/** Le projet, tel qu'il se décrit : initiative étudiante indépendante, sans lien officiel avec l'université. */
export function organizationLd() {
  const org = env.organization;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID(),
    name: SITE_NAME,
    url: `${env.baseUrl}/`,
    logo: `${env.baseUrl}/icon-512.png`,
    description: `Initiative étudiante indépendante et non commerciale${org.city ? `, à ${org.city}` : ""}, sans lien officiel avec ${org.university || "l’université"}.`,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: `${env.baseUrl}/contact`, availableLanguage: "fr" },
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${env.baseUrl}/#site`,
    name: SITE_NAME,
    url: `${env.baseUrl}/`,
    inLanguage: "fr",
    publisher: { "@id": ORGANIZATION_ID() },
  };
}

/** Fil d'Ariane d'une page d'information : Campuss (la présentation) › la page. */
export function breadcrumbLd(path: PublicPath, name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${env.baseUrl}/` },
      { "@type": "ListItem", position: 2, name, item: `${env.baseUrl}${path}` },
    ],
  };
}
