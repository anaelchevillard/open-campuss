import type { NextConfig } from "next";
import { noindexSource } from "./src/lib/indexable";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  // Pas d'optimiseur d'images : il ferait du serveur un relais de téléchargement (SSRF, déni de service)
  images: { unoptimized: true },
  serverExternalPackages: ["@node-rs/argon2", "pg", "yauzl", "sharp", "web-push"],
  experimental: {
    serverActions: { bodySizeLimit: "16mb" },
    proxyClientMaxBodySize: "17mb",
  },
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  // Anciennes adresses de la refonte (308) : les favoris, les mails déjà partis et les liens partagés continuent de marcher
  async redirects() {
    return [
      { source: "/favoris", destination: "/matieres?favoris=1", permanent: true },
      { source: "/calendrier", destination: "/reviser/partiels", permanent: true },
      { source: "/groupes", destination: "/reviser/ensemble", permanent: true },
      { source: "/classement", destination: "/reviser/classement", permanent: true },
      { source: "/account", destination: "/parametres", permanent: true },
      { source: "/dossier-connecte", destination: "/parametres/comptes-connectes", permanent: true },
      { source: "/admin/users", destination: "/admin/personnes", permanent: true },
      { source: "/admin/users/:id", destination: "/admin/personnes/:id", permanent: true },
      { source: "/admin/documents", destination: "/admin/contenus", permanent: true },
      { source: "/admin/audit", destination: "/admin/journal", permanent: true },
      { source: "/admin/signalements", destination: "/admin/moderation", permanent: true },
      // La présentation est devenue « / » (exactement /presentation : ses captures restent sous /presentation/…)
      { source: "/presentation", destination: "/", permanent: true },
    ];
  },
  async headers() {
    return [{
      // Captures de la présentation et icônes : publiques, sans nom haché (une capture refaite garde son nom), donc
      // gardées un jour puis revalidées en arrière-plan. Jamais une page : ni « / » (la présentation), ni /presentation (:path+).
      source: "/presentation/:path+",
      headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
    }, {
      source: "/:icon(icon-192.png|icon-512.png|og.png)",
      headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
    }, {
      // Modèle 3D : dossier versionné (telephone-<n>, à changer à chaque nouvelle version du modèle), donc immuable
      source: "/presentation/telephone-:version/:file*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }, {
      // Logo et polices des mails : lus par les messageries (webmails d'une autre origine pour les polices)
      source: "/mail/:path*",
      headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
    }, {
      // Logo BIMI : relu par les messageries à chaque vérification de l'enregistrement DNS
      source: "/bimi/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
    }, {
      // Chargés par des pages isolées, donc d'origine opaque
      source: "/vendor/:path*",
      headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "public, max-age=86400" }],
    }, {
      // Tout reste hors des moteurs, sauf les pages publiques et l'image de partage (src/lib/indexable.ts)
      source: noindexSource(),
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }, {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ],
    }];
  },
};

export default nextConfig;
