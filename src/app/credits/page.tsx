import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { JsonLd } from "@/components/json-ld";
import { LegalShell } from "@/components/legal-shell";
import { env } from "@/lib/env";
import { inCity, independenceText } from "@/lib/organization-text";
import { breadcrumbLd, publicMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return publicMetadata({ path: "/credits", title: "Mentions et crédits", description: `Éditeur et hébergement de Campuss, initiative étudiante indépendante${inCity(env.organization)}, et crédits : polices, logiciels et bibliothèques libres utilisés par le site.` });
}

/** Page du modèle 3D de la présentation (licence Sketchfab Standard : crédit de l'auteur, fichier non redistribué). */
const PHONE_MODEL_URL = "https://sketchfab.com/3d-models/apple-iphone-18-pro-max-burgundy-2026-604acc18b5d5455d820a16359b45b003";

const LIBRARIES: [string, string][] = [
  ["Next.js", "MIT"], ["React", "MIT"], ["TypeScript", "Apache-2.0"], ["Tailwind CSS", "MIT"], ["shadcn/ui", "MIT"], ["Base UI", "MIT"],
  ["Motion", "MIT"], ["Hugeicons (édition gratuite)", "MIT"], ["BlockNote", "MPL-2.0"], ["Hocuspocus", "MIT"], ["Yjs", "MIT"], ["mammoth.js", "BSD-2-Clause"], ["fast-xml-parser", "MIT"], ["driver.js", "MIT"], ["ReUI", "composants gratuits"], ["Lucide (artefacts uniquement)", "ISC"], ["Drizzle ORM", "Apache-2.0"], ["node-postgres", "MIT"], ["AWS SDK pour JavaScript", "Apache-2.0"],
  ["Nodemailer", "MIT-0"], ["Zod", "MIT"], ["Argon2 (node-rs)", "MIT"], ["otpauth", "MIT"], ["qrcode", "MIT"], ["yauzl", "MIT"],
  ["Milkdown", "MIT"], ["react-markdown", "MIT"], ["unified, remark et rehype", "MIT"], ["marked", "MIT"], ["KaTeX", "MIT"], ["Prism", "MIT"],
  ["react-notion-x et notion-compat", "MIT"], ["Client Notion officiel", "MIT"],
  ["SimpleWebAuthn", "MIT"], ["pdf-lib", "MIT"], ["unpdf", "MIT"], ["esbuild", "MIT"], ["Babel", "MIT"], ["Recharts", "MIT"], ["D3", "ISC"],
  ["math.js", "Apache-2.0"], ["Lodash", "MIT"], ["Papa Parse", "MIT"],
  ["three.js (téléphone 3D de la présentation)", "MIT"], ["Lenis (défilement fluide de la présentation)", "MIT"],
];

// Rendue à la demande : l’éditeur vient d’app.env, lu au démarrage et non au build
export default async function CreditsPage() {
  await connection();
  return (
    <>
      <JsonLd data={breadcrumbLd("/credits", "Mentions et crédits")} />
      <LegalShell title="Mentions et crédits" updated="novembre 2026">
        <h2>Éditeur et hébergement</h2>
        <p>{independenceText(env.organization.university)} Ce projet n’a aucun but commercial.</p>
        <p>Édité par {env.legalPublisher || "l’administrateur de Campuss"}. Contact : <Link href="/contact">formulaire de contact</Link>.</p>
        <p>Hébergé sur un serveur auto-géré par l’éditeur.</p>

        <h2>Contenus</h2>
        <p>Les notes et documents appartiennent à leurs auteurs. Les enseignements restent la propriété de leurs auteurs : un ayant droit peut <Link href="/cgu#retrait">demander un retrait</Link> à tout moment.</p>

        <h2>Polices</h2>
        <ul>
          <li><strong>Massilia</strong>, Matthieu Salvaggio, Blaze Type : titres et logo.</li>
          <li><strong>Source Sans 3</strong>, Paul D. Hunt, Adobe, licence SIL Open Font 1.1 : texte.</li>
          <li><strong>Atkinson Hyperlegible Next</strong>, Braille Institute, licence SIL Open Font 1.1 : lecture adaptée.</li>
          <li><strong>Source Serif 4</strong>, Frank Grießhammer, Adobe, licence SIL Open Font 1.1 : lecture à empattements.</li>
          <li><strong>OpenDyslexic</strong>, Abbie Gonzalez, licence SIL Open Font 1.1 : texte des cours, au choix.</li>
        </ul>

        <h2>Page de présentation</h2>
        <p>Les captures montrent un jeu de démonstration fictif, jamais des comptes réels.</p>
        <p>Téléphone en 3D : modèle « <a href={PHONE_MODEL_URL} rel="noopener noreferrer">Apple iPhone 18 Pro Max Burgundy 2026</a> » par extraakash (Sketchfab), sous licence Sketchfab Standard, allégé pour le web et affiché avec les captures de Campuss. Le fichier n’est pas proposé au téléchargement.</p>
        <p>Les autres maquettes (le téléphone affiché sans 3D, la tablette et la fenêtre de navigateur) sont dessinées par Campuss en CSS et SVG, sans image d’Apple. Proportions vérifiées sur les composants libres de Magic UI (licence MIT), sans en reprendre le code. iPhone, iPad et Safari sont des marques d’Apple Inc., sans lien avec Campuss.</p>

        <h2>Services et logiciels</h2>
        <p>PostgreSQL, MinIO (build Chainguard), Docker, Traefik, ClamAV et restic. Vérification des mots de passe par Have I Been Pwned. Mails envoyés par Amazon SES. Transcription par Google Gemini.</p>

        <h2>Bibliothèques</h2>
        <table>
          <thead><tr><th>Bibliothèque</th><th>Licence</th></tr></thead>
          <tbody>{LIBRARIES.map(([name, license]) => <tr key={name}><td>{name}</td><td>{license}</td></tr>)}</tbody>
        </table>
        <p>Merci à leurs auteurs et à leurs communautés.</p>
      </LegalShell>
    </>
  );
}
