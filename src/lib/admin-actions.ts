/**
 * Niveaux des actions d'administration (règle pure, testée) :
 * - courante : exécution immédiate, « Annuler » par l'action inverse ;
 * - sensible : second facteur récent (10 min), motif proposé (facultatif) ;
 * - critique : second facteur de moins de 2 min, saisie du nom, délai de grâce quand il existe.
 */
/** Mention du journal quand l'admin ne donne pas de motif (le motif est facultatif). */
export const NO_REASON = "(sans motif)";

export type ActionLevel = "read" | "routine" | "sensitive" | "critical";

type ActionInfo = { label: string; level: ActionLevel; kind: "person" | "content" | "structure" | "site" | "security" | "moderation" };

export const ADMIN_ACTIONS = {
  // Personnes
  "compte.accepte": { label: "Demande acceptée", level: "routine", kind: "person" },
  "compte.refuse": { label: "Demande refusée", level: "routine", kind: "person" },
  "compte.reactive": { label: "Compte réactivé", level: "sensitive", kind: "person" },
  "profil.nom": { label: "Nom modifié", level: "routine", kind: "person" },
  "profil.pronoms": { label: "Pronoms modifiés", level: "routine", kind: "person" },
  "profil.bio": { label: "Bio modifiée", level: "routine", kind: "person" },
  "profil.avatar": { label: "Avatar retiré", level: "routine", kind: "person" },
  "profil.matiere": { label: "Matière préférée modifiée", level: "routine", kind: "person" },
  "profil.code_ami": { label: "Code ami régénéré", level: "routine", kind: "person" },
  "profil.apparence": { label: "Apparence réinitialisée", level: "routine", kind: "person" },
  "profil.banniere": { label: "Bannière retirée", level: "routine", kind: "person" },
  "profil.licence": { label: "Licence modifiée", level: "sensitive", kind: "person" },
  "profil.annee": { label: "Année modifiée", level: "sensitive", kind: "person" },
  "profil.adresse": { label: "Adresse modifiée", level: "sensitive", kind: "person" },
  "role.change": { label: "Rôle modifié", level: "sensitive", kind: "security" },
  "role.admin": { label: "Admin nommé ou retiré", level: "critical", kind: "security" },
  "role.matieres": { label: "Matières d’un enseignant", level: "sensitive", kind: "security" },
  "compte.suspendu": { label: "Compte suspendu", level: "sensitive", kind: "security" },
  "compte.suspension_levee": { label: "Suspension levée", level: "sensitive", kind: "security" },
  "compte.banni": { label: "Compte banni", level: "critical", kind: "security" },
  "compte.suppression": { label: "Suppression programmée", level: "critical", kind: "security" },
  "compte.suppression_annulee": { label: "Suppression annulée", level: "sensitive", kind: "security" },
  "compte.supprime": { label: "Compte supprimé", level: "critical", kind: "security" },
  "securite.2fa": { label: "Second facteur réinitialisé", level: "sensitive", kind: "security" },
  "securite.sessions": { label: "Sessions déconnectées", level: "sensitive", kind: "security" },
  "securite.lien_mdp": { label: "Lien de mot de passe envoyé", level: "sensitive", kind: "security" },
  "securite.forcer_mdp": { label: "Changement de mot de passe forcé", level: "sensitive", kind: "security" },
  "securite.lien_connexion": { label: "Lien de connexion envoyé", level: "sensitive", kind: "security" },
  "securite.mdp_provisoire": { label: "Mot de passe provisoire donné", level: "sensitive", kind: "security" },
  "credits.ajustes": { label: "Crédits ajustés", level: "sensitive", kind: "person" },
  "badge.attribue": { label: "Badge attribué", level: "routine", kind: "person" },
  "badge.retire": { label: "Badge retiré", level: "routine", kind: "person" },
  "objet.accorde": { label: "Objet accordé", level: "routine", kind: "person" },
  "note.ajoutee": { label: "Note interne ajoutée", level: "routine", kind: "person" },
  "note.supprimee": { label: "Note interne supprimée", level: "routine", kind: "person" },
  "compte.cree": { label: "Compte créé", level: "sensitive", kind: "person" },
  "invitations.envoyees": { label: "Invitations envoyées", level: "sensitive", kind: "person" },
  "invitation.lien": { label: "Lien d’invitation créé", level: "sensitive", kind: "person" },
  "invitation.revoquee": { label: "Invitation révoquée", level: "routine", kind: "person" },
  "invitation.renvoyee": { label: "Invitation renvoyée", level: "routine", kind: "person" },
  "personnes.message": { label: "Message envoyé", level: "routine", kind: "person" },
  "personnes.export": { label: "Export CSV", level: "sensitive", kind: "person" },
  "voir_comme.debut": { label: "Voir comme : début", level: "critical", kind: "security" },
  "voir_comme.fin": { label: "Voir comme : fin", level: "read", kind: "security" },
  "fiche.activite": { label: "Activité consultée", level: "read", kind: "person" },
  // Contenus
  "cours.publie": { label: "Cours publié", level: "routine", kind: "content" },
  "cours.depublie": { label: "Cours dépublié", level: "routine", kind: "content" },
  "cours.matiere": { label: "Matière d’un cours changée", level: "routine", kind: "content" },
  "cours.auteur": { label: "Auteur transféré", level: "sensitive", kind: "content" },
  "cours.coauteur_ajoute": { label: "Co-auteur ajouté", level: "sensitive", kind: "content" },
  "cours.coauteur_retire": { label: "Co-auteur retiré", level: "sensitive", kind: "content" },
  "cours.corbeille": { label: "Cours mis à la corbeille", level: "routine", kind: "content" },
  "cours.restaure": { label: "Cours restauré", level: "routine", kind: "content" },
  "corbeille.videe": { label: "Corbeille vidée", level: "critical", kind: "content" },
  "cours.purge": { label: "Cours supprimé définitivement", level: "critical", kind: "content" },
  // Structure
  "matiere.creee": { label: "Matière ajoutée", level: "routine", kind: "structure" },
  "matiere.renommee": { label: "Matière renommée", level: "routine", kind: "structure" },
  "matiere.semestre": { label: "Semestre d’une matière", level: "routine", kind: "structure" },
  "matiere.ordre": { label: "Matières réordonnées", level: "routine", kind: "structure" },
  "matiere.archivee": { label: "Matière archivée", level: "routine", kind: "structure" },
  "matiere.restauree": { label: "Matière restaurée", level: "routine", kind: "structure" },
  "matiere.fusionnee": { label: "Matières fusionnées", level: "sensitive", kind: "structure" },
  "matieres.importees": { label: "Matières importées", level: "sensitive", kind: "structure" },
  "licence.creee": { label: "Licence créée", level: "routine", kind: "structure" },
  "licence.ouverte": { label: "Licence ouverte ou fermée", level: "sensitive", kind: "structure" },
  "licence.dates": { label: "Dates des semestres", level: "routine", kind: "structure" },
  // Modération
  "signalement.clos": { label: "Signalement clos", level: "routine", kind: "moderation" },
  "signalement.rouvert": { label: "Signalement rouvert", level: "routine", kind: "moderation" },
  "retrait.accepte": { label: "Retrait de cours accepté", level: "routine", kind: "moderation" },
  "retrait.refuse": { label: "Retrait de cours refusé", level: "routine", kind: "moderation" },
  "profil.signalement": { label: "Profil modéré", level: "routine", kind: "moderation" },
  "demande.fusionnee": { label: "Demandes fusionnées", level: "routine", kind: "moderation" },
  "demande.close": { label: "Demande close", level: "routine", kind: "moderation" },
  "demande.modifiee": { label: "Demande modifiée", level: "routine", kind: "moderation" },
  // Site
  "reglage.modifie": { label: "Réglage modifié", level: "sensitive", kind: "site" },
  "inscriptions.fermees": { label: "Inscriptions fermées", level: "critical", kind: "site" },
  "annonce.publiee": { label: "Annonce publiée", level: "routine", kind: "site" },
  "annonce.modifiee": { label: "Annonce modifiée", level: "routine", kind: "site" },
  "annonce.retiree": { label: "Annonce retirée", level: "routine", kind: "site" },
  "journal.export": { label: "Journal exporté", level: "sensitive", kind: "site" },
  "systeme.mail_test": { label: "Mail de test", level: "routine", kind: "site" },
  "systeme.relance": { label: "Mails relancés", level: "routine", kind: "site" },
} as const satisfies Record<string, ActionInfo>;

export type AdminAction = keyof typeof ADMIN_ACTIONS;

export const levelOfAction = (action: string): ActionLevel | null => (ADMIN_ACTIONS as Record<string, ActionInfo>)[action]?.level ?? null;

/** Libellé lisible d'une ligne du journal, y compris les anciennes actions écrites « compte_accepté ». */
export function actionLabel(action: string) {
  const known = (ADMIN_ACTIONS as Record<string, ActionInfo>)[action];
  if (known) return known.label;
  const text = action.replaceAll("_", " ").replaceAll(".", " · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const actionKind = (action: string) => (ADMIN_ACTIONS as Record<string, ActionInfo>)[action]?.kind ?? "person";

export const LEVEL_LABELS: Record<ActionLevel, string> = { read: "Consultation", routine: "Courante", sensitive: "Sensible", critical: "Critique" };

/** Durée de validité du second facteur selon le niveau : 10 min pour le sensible, 2 min pour le critique. */
export const STEP_UP_CRITICAL_MS = 120_000;

/** Ce que demande le niveau avant d'agir : motif et saisie du nom. */
export function requirements(level: ActionLevel) {
  return { freshFactor: level === "sensitive" || level === "critical", reason: level === "sensitive" || level === "critical", typeName: level === "critical" };
}

/** Badges attribués à la main, en rareté Spéciale. */
export const MANUAL_BADGES = [
  { id: "equipe", name: "Équipe" },
  { id: "pionnier", name: "Pionnier" },
  { id: "delegue-annee", name: "Délégué de l’année" },
] as const;

export const ROLE_LABELS: Record<string, string> = { member: "Membre", contributor: "Contributeur", delegate: "Délégué", teacher: "Enseignant", admin: "Admin" };
export const STATUS_LABELS: Record<string, string> = { unverified: "Mail non confirmé", pending: "En attente", active: "Actif", rejected: "Refusé", disabled: "Désactivé", banned: "Banni" };
