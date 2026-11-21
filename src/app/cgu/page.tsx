import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { LegalShell } from "@/components/legal-shell";
import { env } from "@/lib/env";
import { independenceText } from "@/lib/organization-text";
import { breadcrumbLd, publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({ path: "/cgu", title: "Conditions d’utilisation", description: "Les règles de Campuss : accès réservé aux étudiants, ce qu’on peut partager au regard du droit d’auteur, et comment un enseignant ou un ayant droit obtient le retrait d’un document." });

export default function TermsPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd("/cgu", "Conditions d’utilisation")} />
      <LegalShell title="Conditions d’utilisation" updated="novembre 2026">
        <p>{independenceText(env.organization.university)} Ce projet non commercial aide les étudiants d’une même licence à partager leurs notes et à réviser ensemble. Campuss n’est ni édité ni approuvé par l’université. En créant un compte, vous acceptez les règles ci-dessous.</p>

        <h2>Accès</h2>
        <ul>
          <li>Campuss est réservé aux étudiants. Votre compte est personnel : ne partagez ni vos identifiants ni l’accès au site.</li>
          <li>Vous n’accédez qu’aux contenus de votre licence. Vous devez indiquer votre vraie licence.</li>
          <li>Un compte peut être refusé, suspendu ou supprimé en cas de non-respect de ces règles.</li>
        </ul>

        <h2 id="droit-auteur">Droit d’auteur : ce que vous pouvez partager</h2>
        <p>Un cours est une œuvre protégée : il appartient à l’enseignant qui l’a créé. Le fait que Campuss soit réservé à une promotion ne donne pas le droit d’y déposer ses documents sans son accord.</p>
        <table>
          <thead><tr><th>Contenu</th><th>Sur Campuss</th></tr></thead>
          <tbody>
            <tr><td>Vos fiches de révision, exercices et projets personnels</td><td>Permis</td></tr>
            <tr><td>Vos notes, reformulées avec vos mots et votre organisation</td><td>Permis, sans recopier le cours</td></tr>
            <tr><td>Un document de l’enseignant, avec son accord écrit</td><td>Permis, en le précisant</td></tr>
            <tr><td>Un sujet d’examen publié par l’université ou autorisé par son auteur</td><td>Permis, en le précisant</td></tr>
            <tr><td>Polycopié, diaporama ou support d’un enseignant, sans accord</td><td>Interdit</td></tr>
            <tr><td>Transcription mot à mot ou enregistrement d’un cours</td><td>Interdit</td></tr>
            <tr><td>Sujet d’examen non public, sans accord</td><td>Interdit, et refusé par le formulaire</td></tr>
            <tr><td>Extrait de manuel ou d’article payant</td><td>Interdit</td></tr>
          </tbody>
        </table>
        <p>À chaque partage, vous attestez être l’auteur du contenu ou avoir l’autorisation écrite de son titulaire. Cet engagement est enregistré (date, document, adresse IP). Vous assumez la responsabilité de ce que vous déposez et vous garantissez Campuss et ses administrateurs contre toute réclamation liée à une fausse déclaration. Vous devez aussi avoir le droit d’utiliser la photo de votre profil.</p>
        <p>Une fausse déclaration entraîne le retrait du contenu et peut entraîner la suppression du compte. Citez la matière et, si possible, l’enseignant dont le cours a inspiré vos notes. Une note reste une aide au travail : elle ne remplace pas le cours.</p>
        <p>Ne rediffusez pas les contenus de Campuss en dehors du site. Vous gardez vos droits sur ce que vous publiez et autorisez Campuss à l’afficher aux étudiants concernés, jusqu’à son retrait.</p>

        <h2 id="retrait">Enseignants et ayants droit : demander un retrait</h2>
        <p>Si un contenu vous appartient et qu’il a été déposé sans votre accord, <Link href="/contact">écrivez-nous</Link> en indiquant le document, votre qualité et le motif. Vous n’avez pas besoin de compte. Le contenu est retiré dès que possible, le temps de vérifier la demande, et il ne sera pas republié sans votre accord.</p>

        <h2>Contenus et comportement</h2>
        <ul>
          <li>Les contenus sont relus par un administrateur avant publication. Cette relecture ne garantit ni leur exactitude ni leur conformité : vérifiez toujours avec vos cours.</li>
          <li>Sont interdits les contenus illicites, injurieux, discriminatoires, ou qui exposent la vie privée d’une personne.</li>
          <li>Les questions-réponses restent courtoises et liées au cours. Elles sont modérées et les messages signalés peuvent être masqués.</li>
          <li>Les quiz sont générés par une IA et peuvent contenir des erreurs : le cours fait foi.</li>
          <li>La triche à un examen et le contournement des règles de l’université sont interdits.</li>
        </ul>

        <h2>Crédits, badges et classement</h2>
        <p>Les crédits, badges et trophées sont un simple jeu, sans valeur réelle : ce ne sont pas des crédits ECTS. Ils peuvent être modifiés ou retirés, notamment en cas d’abus. Vous choisissez d’apparaître ou non dans le classement.</p>

        <h2>Disponibilité</h2>
        <p>Campuss est proposé gratuitement, sans garantie de disponibilité ni de conservation : gardez une copie de vos documents importants.</p>

        <h2>Vos données</h2>
        <p>Leur utilisation est décrite dans la <Link href="/confidentialite">politique de confidentialité</Link>. Vous pouvez supprimer votre compte à tout moment depuis Mon compte.</p>

        <h2>Modifications et droit applicable</h2>
        <p>Ces conditions peuvent évoluer ; une nouvelle acceptation vous sera demandée en cas de changement. Elles sont soumises au droit français.</p>
      </LegalShell>
    </>
  );
}
