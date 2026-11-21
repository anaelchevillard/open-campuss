/**
 * Établissement desservi par une instance de Campuss, lu dans la configuration (lib/env.ts) : rien n'est propre à une
 * université dans le code. Vide par défaut : les phrases restent justes sans nom d'établissement ni de ville.
 * Fonctions pures, partagées par les pages serveur, /llms.txt et la mention d'indépendance du navigateur.
 */
export type Organization = {
  /** Après « de », article compris : « l’UFR Lettres d’Exempleville ». */
  name: string;
  /** Surtitre de la présentation : « UFR Lettres · Exempleville ». */
  short: string;
  /** Ville, après « à » : « Exempleville ». */
  city: string;
  /** Université, article compris : « l’Université d’Exemple ». */
  university: string;
};

export const NO_ORGANIZATION: Organization = { name: "", short: "", city: "", university: "" };

/** « de l’UFR Lettres d’Exempleville », précédé d'une espace ; rien sans établissement. */
export const ofOrganization = (org: Organization) => (org.name ? ` de ${org.name}` : "");

/** « à Exempleville », précédé d'une espace ; rien sans ville. */
export const inCity = (org: Organization) => (org.city ? ` à ${org.city}` : "");

/** Une seule formulation partout : la mention engage le projet, elle ne doit pas varier d'une page à l'autre. */
export const independenceText = (university: string) =>
  `Campuss est une initiative étudiante indépendante, sans lien officiel avec ${university || "l’université"}.`;
