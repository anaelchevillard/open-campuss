import { IconLink, IconNotifications, IconPalette, IconPrivacy, IconRevise, IconSecurity, IconUser, type IconData } from "@/lib/icons";

export type SectionId = "profil" | "compte" | "affichage" | "notifications" | "revision" | "confidentialite" | "comptes-connectes";
export type Section = { id: SectionId; label: string; icon: IconData; group: string; hint: string };

/**
 * Les sections des paramètres, dans l'ordre des deux navigations (liste du téléphone, colonne de l'ordinateur).
 * « Profil et apparence » mène à son propre profil, où l'on personnalise en direct.
 * `hint` : ce qu'on trouve dans la section (page d'accueil des paramètres).
 */
export const SECTIONS: Section[] = [
  { id: "profil", label: "Profil et apparence", icon: IconUser, group: "Ton compte", hint: "Photo, bio, statut, réseaux, cadre, bannière et nom" },
  { id: "compte", label: "Compte et sécurité", icon: IconSecurity, group: "Ton compte", hint: "Adresse, mot de passe, double authentification, appareils, données" },
  { id: "affichage", label: "Affichage et lecture", icon: IconPalette, group: "Application", hint: "Thème, police et taille du texte, animations" },
  { id: "notifications", label: "Réglages des notifications", icon: IconNotifications, group: "Application", hint: "Notifications sur cet appareil, résumé par mail, sons" },
  { id: "revision", label: "Révision", icon: IconRevise, group: "Application", hint: "Rythme, rappel du jour, vacances, jeu" },
  { id: "confidentialite", label: "Confidentialité", icon: IconPrivacy, group: "Confidentialité et services", hint: "Visibilité, personnes bloquées, liens de partage, cookies" },
  { id: "comptes-connectes", label: "Comptes connectés", icon: IconLink, group: "Confidentialité et services", hint: "Connexion à Campuss et services reliés à ton compte" },
];

export const sectionHref = (id: SectionId) => `/parametres/${id}`;

/** Lien d'un réglage trouvé : l'ancre en #fragment, sauf pour le profil, qui passe par une redirection (paramètre `ancre`). */
export const settingHref = (section: SectionId, anchor?: string) =>
  !anchor ? sectionHref(section) : section === "profil" ? `${sectionHref(section)}?ancre=${anchor}` : `${sectionHref(section)}#${anchor}`;

/** Les enseignants n'ont pas de révision. */
export const sectionsFor = (role: string, connected: boolean) => SECTIONS.filter((s) => (role !== "teacher" || s.id !== "revision") && (connected || s.id !== "comptes-connectes"));

/** Index de la recherche dans les réglages : un mot, sa section, son ancre. */
export const SETTINGS_INDEX: { label: string; section: SectionId; anchor?: string; words?: string }[] = [
  { label: "Nom", section: "profil", anchor: "nom", words: "prénom pseudo" },
  { label: "Réseaux", section: "profil", anchor: "reseaux", words: "instagram tiktok snapchat" },
  { label: "Photo", section: "profil", anchor: "photo", words: "avatar image" },
  { label: "Pronoms", section: "profil", anchor: "pronoms" },
  { label: "Bio", section: "profil", anchor: "bio", words: "description présentation" },
  { label: "Matière préférée", section: "profil", anchor: "matiere" },
  { label: "Statut", section: "profil", anchor: "statut", words: "emoji humeur" },
  { label: "Police du nom", section: "profil", anchor: "apparence", words: "pseudo écriture" },
  { label: "Couleur du nom", section: "profil", anchor: "apparence", words: "dégradé pseudo" },
  { label: "Badge à côté du nom", section: "profil", anchor: "apparence" },
  { label: "Bannière", section: "profil", anchor: "banniere", words: "image fond" },
  { label: "Fond de la carte", section: "profil", anchor: "banniere", words: "couleur profil" },
  { label: "Cadre d’avatar", section: "profil", anchor: "cadre", words: "photo anneau effet lueur" },
  { label: "Vitrine", section: "profil", anchor: "vitrine", words: "épingler cours badges" },
  { label: "Adresse mail", section: "compte", anchor: "adresse", words: "email courriel" },
  { label: "Mot de passe", section: "compte", anchor: "mot-de-passe" },
  { label: "Licence et année", section: "compte", anchor: "licence", words: "L1 L2 L3" },
  { label: "Double authentification", section: "compte", anchor: "securite", words: "2FA code TOTP" },
  { label: "Clés d’accès", section: "compte", anchor: "cles", words: "passkey empreinte" },
  { label: "Codes de secours", section: "compte", anchor: "codes" },
  { label: "Appareils et sessions", section: "compte", anchor: "appareils", words: "déconnecter" },
  { label: "Exporter mes données", section: "compte", anchor: "donnees", words: "RGPD télécharger" },
  { label: "Supprimer le compte", section: "compte", anchor: "supprimer" },
  { label: "Thème", section: "affichage", anchor: "lecture", words: "sombre clair système" },
  { label: "Police de lecture", section: "affichage", anchor: "lecture", words: "dyslexie atkinson opendyslexic" },
  { label: "Taille du texte", section: "affichage", anchor: "lecture" },
  { label: "Espacement", section: "affichage", anchor: "lecture", words: "dyslexie aéré" },
  { label: "Mode compact", section: "affichage", anchor: "interface", words: "densité" },
  { label: "Réduire les animations", section: "affichage", anchor: "interface", words: "mouvement" },
  { label: "Barres fixes", section: "affichage", anchor: "interface" },
  { label: "Styles des autres", section: "affichage", anchor: "autres", words: "noms polices couleurs" },
  { label: "Notifications sur cet appareil", section: "notifications", words: "push" },
  { label: "Résumé de la semaine", section: "notifications", words: "mail" },
  { label: "Sons et vibrations", section: "notifications", anchor: "sons" },
  { label: "Classement", section: "confidentialite", anchor: "visibilite" },
  { label: "Partager ma révision", section: "confidentialite", anchor: "visibilite", words: "amis" },
  { label: "En train de réviser", section: "confidentialite", anchor: "visibilite" },
  { label: "Personnes bloquées", section: "confidentialite", anchor: "bloques", words: "débloquer" },
  { label: "Liens de partage", section: "confidentialite", anchor: "liens" },
  { label: "Suivi des pages", section: "confidentialite", anchor: "suivi", words: "cookies mesure" },
];
