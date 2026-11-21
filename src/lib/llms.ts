/**
 * /llms.txt et /llms-full.txt (format llmstxt.org) : ce que Campuss est, en phrases factuelles et citables, pour les
 * moteurs génératifs. Uniquement ce qui est déjà public sur la présentation et les pages d'information : aucun chiffre
 * inventé, aucune donnée personnelle, aucun détail d'infrastructure (serveurs, adresses, prestataires d'envoi).
 */
import { independenceText, NO_ORGANIZATION, ofOrganization, type Organization } from "@/lib/organization-text";

/** `org` : établissement de l'instance (lib/env.ts), aucun par défaut. */
type Options = { baseUrl: string; ai: boolean; org?: Organization };

const summary = (org: Organization) => `Campuss est un site web gratuit, sans publicité, où les étudiants${ofOrganization(org)} partagent leurs cours, fiches, TD corrigés et anciens partiels, puis les révisent avec des fiches mémo.`;

function facts({ ai, org = NO_ORGANIZATION }: Options): string[] {
  return [
    `Public : les étudiants de licence${ofOrganization(org)}${org.university ? ` (${org.university.replace(/^l[’']/, "")})` : ""}. Le compte est réservé aux étudiants, et chacun n’accède qu’aux contenus de sa licence.`,
    "Contenus : cours, fiches, TD corrigés et anciens partiels, écrits ou déposés par les étudiants et rangés par licence, année, semestre et matière.",
    "Lecture et révision : surlignage, notes en marge, fiches mémo en révision espacée (import depuis Anki, Quizlet ou un tableur), partiels et contrôles continus avec compte à rebours, rappels, plan de révision et partiel blanc, révision entre amis, recherche (Ctrl K), lecture adaptée (polices OpenDyslexic et Atkinson Hyperlegible, taille, interligne, mode sombre).",
    ...(ai ? ["Campuss IA (facultative) : transcrit une photo de notes en cours, propose le titre et la matière d’un fichier déposé, tire des fiches mémo et un quiz d’un cours publié. Elle ne reçoit jamais le nom ni le compte de l’étudiant."] : []),
    "Droit d’auteur : on publie ses propres notes, son travail personnel, ou un document de l’enseignant avec son accord écrit. L’origine est déclarée à chaque dépôt, un cours proposé par un étudiant est relu par un délégué ou la modération avant sa publication, et un enseignant peut demander un retrait sans compte.",
    "Confidentialité : pas de publicité ni de pisteur publicitaire ; mesure d’audience interne ; suivi lié au compte seulement avec l’accord de l’étudiant ; données stockées sur un serveur auto-géré par l’éditeur ; export des données depuis le compte.",
    "Les cours et les pages connectées sont privés : ils ne sont ni publics ni indexés.",
    "Prix : gratuit. Projet non commercial, porté bénévolement par des étudiants.",
    `Indépendance : ${independenceText(org.university)}`,
    "Code : Campuss est open source.",
  ];
}

function pages(baseUrl: string): string[] {
  return [
    `- [Présentation](${baseUrl}/) : ce que fait Campuss, captures, questions fréquentes`,
    `- [Conditions d’utilisation](${baseUrl}/cgu) : accès, droit d’auteur, retrait d’un contenu`,
    `- [Confidentialité et cookies](${baseUrl}/confidentialite) : données traitées, durées, prestataires, droits RGPD`,
    `- [Mentions et crédits](${baseUrl}/credits) : éditeur, polices et bibliothèques libres`,
    `- [Signaler ou nous écrire](${baseUrl}/contact) : demande de retrait, erreur, question`,
  ];
}

export function llmsText(options: Options): string {
  return [
    "# Campuss",
    "",
    `> ${summary(options.org ?? NO_ORGANIZATION)}`,
    "",
    ...facts(options).map((f) => `- ${f}`),
    "",
    "## Pages publiques",
    "",
    ...pages(options.baseUrl),
    "",
    "## Optional",
    "",
    `- [Version longue](${options.baseUrl}/llms-full.txt) : les mêmes faits et les questions fréquentes, en un seul fichier`,
    "",
  ].join("\n");
}

const faq = (org: Organization): [string, string][] => [
  ["Qu’est-ce que Campuss ?", `${summary(org)} ${independenceText(org.university)} Le code de Campuss est open source.`],
  ["C’est gratuit ?", "Oui, et sans publicité. Le projet est porté bénévolement par des étudiants."],
  ["Qui relit les cours ?", "Les délégués de la licence et la modération, avant toute publication. Seuls eux, et les enseignants dans leurs matières, publient sans passer par cette relecture."],
  ["Qui peut s’inscrire ?", `Les étudiants${ofOrganization(org)}, avec leur adresse étudiante. Selon la période, l’inscription est ouverte, sur invitation ou fermée ; la présentation indique l’état actuel.`],
  ["C’est légal de partager des cours ?", "On publie ses propres notes, son travail personnel et des documents partagés avec l’accord écrit de l’enseignant. L’origine est déclarée à chaque dépôt, et un enseignant peut demander un retrait."],
  ["Qui voit ce que je fais ?", "Les cours publiés sont visibles dans la licence de l’auteur. Ceux qui ne sont pas ses amis voient son prénom et l’initiale de son nom. Ses révisions, seulement ses amis, s’il le choisit."],
  ["Je peux partir avec mes données ?", "Oui : elles se téléchargent depuis le compte. Si le compte est supprimé, les cours publiés restent, sans le nom de leur auteur."],
  ["C’est lié à l’université ?", `Non. ${independenceText(org.university)}`],
];

export function llmsFullText(options: Options): string {
  return [
    "# Campuss",
    "",
    `> ${summary(options.org ?? NO_ORGANIZATION)}`,
    "",
    "## En bref",
    "",
    ...facts(options).map((f) => `- ${f}`),
    "",
    "## Questions fréquentes",
    "",
    ...faq(options.org ?? NO_ORGANIZATION).flatMap(([q, a]) => [`### ${q}`, "", a, ""]),
    "## Pages publiques",
    "",
    ...pages(options.baseUrl),
    "",
  ].join("\n");
}
