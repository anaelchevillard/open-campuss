import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { preload } from "react-dom";
import { Motion } from "@/components/motion";
import { loadSession } from "@/lib/auth";
import { criticalFontUrls } from "@/lib/font-preload";
import { parsePrefs, prefClasses } from "@/lib/prefs";
import { ConsentBanner } from "@/components/tracker";
import { LazyToaster } from "@/components/lazy-toaster";
import { ErrorReporter } from "@/components/error-reporter";
import { DemoBanner } from "@/components/demo-banner";
import { isDemo } from "@/lib/demo";
import { UniversityProvider } from "@/components/independence";
import { env } from "@/lib/env";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Campuss", template: "%s – Campuss" },
  description: "Les cours de ta licence, au même endroit.",
  metadataBase: new URL(process.env.BASE_URL ?? "https://campuss.fr"),
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  openGraph: { title: "Campuss", description: "Les cours de ta licence, au même endroit.", images: [{ url: "/og.png", width: 1200, height: 630 }], locale: "fr_FR", type: "website" },
  appleWebApp: { capable: true, title: "Campuss", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fbfafa" }, { media: "(prefers-color-scheme: dark)", color: "#151213" }],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La lecture de l'en-tête rend chaque page dynamique : aucune page privée n'entre dans un cache partagé
  await headers();
  const store = await cookies();
  const session = await loadSession();
  const prefs = session?.user.prefs ?? parsePrefs(store.get("campuss-prefs")?.value);
  // Le titre (souvent le LCP) n'attend plus la découverte de Massilia dans la feuille de style
  for (const href of criticalFontUrls()) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="fr" className={`${prefClasses(prefs)} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {/* Conteneur à part : Next ajoute ses scripts dans <body>, et le site ne doit jamais se mêler à eux */}
        {/* Bande de consentement en tête de page, dans le flux : elle ne recouvre aucune action */}
        {/* Démonstration : aucune mesure d’audience, donc rien à consentir */}
        {!isDemo() && <ConsentBanner decided={Boolean(store.get("campuss-consent") || session?.user.trackingConsent)} />}
        <DemoBanner />
        <div id="app" className="flex min-h-dvh flex-col">
          <UniversityProvider university={env.organization.university}><Motion reduce={Boolean(prefs.reduceMotion)}>{children}</Motion></UniversityProvider>
        </div>
        <LazyToaster />
        {/* Erreurs du navigateur, sans identifiant, envoyées même sans accord à la mesure */}
        <ErrorReporter />
      </body>
    </html>
  );
}
