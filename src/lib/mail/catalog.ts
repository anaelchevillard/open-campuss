import { button, facts, hello, note, p, quote, type MailContent } from "./content";

/**
 * Tous les mails du site, comme donnée. Chaque fonction est pure : textes bruts (échappés au rendu) et chemins du
 * site (préfixés par BASE_URL au rendu). L'objet reçoit le nom du site en préfixe au moment de la mise en file.
 */

const askTeam = note("Une question ?", { label: "Écris à l’équipe", path: "/contact" });
const ACCOUNT_CREATED = "Tu reçois ce mail parce qu’un compte {site} a été créé avec cette adresse.";

export const authMails = {
  verifyEmail: (token: string): MailContent => ({
    subject: "confirme ton adresse", title: "Confirme ton adresse", greeting: hello(),
    preheader: "Un clic pour confirmer ton adresse et choisir ton mot de passe.",
    blocks: [
      p("Une demande d’accès a été faite avec cette adresse. Pour la confirmer et choisir ton mot de passe :"),
      button("Confirmer mon adresse", `/verify/${token}`),
      note("Ce lien expire dans 3 jours. Si tu n’es pas à l’origine de cette demande, ignore ce message."),
    ],
    reason: "Tu reçois ce mail parce qu’une demande d’accès à {site} a été faite avec cette adresse.",
  }),
  alreadyRegistered: (): MailContent => ({
    subject: "tu as déjà un compte", title: "Tu as déjà un compte",
    blocks: [
      p("Une inscription a été tentée avec ton adresse, qui possède déjà un compte."),
      p("Mot de passe oublié ?"),
      button("Choisir un nouveau mot de passe", "/forgot"),
      note("Ce n’est pas toi ? Ignore ce message, ton compte ne change pas."),
    ],
  }),
  resetPassword: (token: string): MailContent => ({
    subject: "nouveau mot de passe", title: "Choisis un nouveau mot de passe",
    blocks: [
      p("Tu as demandé à changer ton mot de passe."),
      button("Choisir un mot de passe", `/reset/${token}`),
      note("Ce lien expire dans 1 heure. Si tu n’as rien demandé, ignore ce message."),
    ],
  }),
  recoveryCodeUsed: (): MailContent => ({
    subject: "code de secours utilisé", title: "Un code de secours a servi",
    blocks: [
      p("Un code de secours vient de servir à te connecter."),
      p("Si ce n’est pas toi, change ton mot de passe tout de suite."),
      button("Sécuriser mon compte", "/parametres"),
    ],
  }),
  mfaResetRequested: (): MailContent => ({
    subject: "demande de réinitialisation du second facteur", title: "Réinitialisation du second facteur",
    blocks: [
      p("Une demande de réinitialisation de ton second facteur a été envoyée à l’équipe."),
      p("Pour vérifier que c’est bien toi, l’équipe va t’écrire à cette adresse. Elle ne réinitialisera rien sans ta réponse."),
      note("Ce n’est pas toi ? Change ton mot de passe tout de suite.", { label: "Changer mon mot de passe", path: "/forgot" }),
    ],
  }),
  newDevice: (browser: string, device: string): MailContent => ({
    subject: "nouvelle connexion", title: "Nouvelle connexion à ton compte",
    blocks: [
      p("Une connexion vient d’avoir lieu depuis un nouvel appareil."),
      facts([{ label: "Navigateur", value: browser }, { label: "Appareil", value: device }]),
      p("Ce n’est pas toi ? Change ton mot de passe et déconnecte tes appareils."),
      button("Vérifier mes appareils", "/parametres"),
    ],
  }),
  inactiveDeletion: (): MailContent => ({
    subject: "ton compte va être supprimé", title: "Ton compte va être supprimé",
    blocks: [
      p("Aucune connexion à ton compte depuis près de 3 ans. Sans connexion de ta part d’ici 30 jours, ton compte et tes données seront supprimés."),
      button("Garder mon compte", "/login"),
    ],
  }),
};

export const accountMails = {
  confirmNewEmail: (token: string, hours: number, byTeam = false): MailContent => ({
    subject: "confirme ta nouvelle adresse", title: "Confirme ta nouvelle adresse",
    blocks: [
      p(byTeam ? "L’équipe de {site} a renseigné cette adresse pour ton compte. Pour la confirmer :" : "Pour utiliser cette adresse sur ton compte, confirme-la :"),
      button("Confirmer cette adresse", `/email/${token}`),
      note(`Ce lien expire dans ${hours === 24 ? "24 heures" : `${hours / 24} jours`}.`),
    ],
    reason: "Tu reçois ce mail parce que cette adresse a été indiquée pour un compte {site}.",
  }),
  emailChangeRequested: (): MailContent => ({
    subject: "changement d’adresse demandé", title: "Changement d’adresse demandé",
    blocks: [
      p("Un changement d’adresse a été demandé sur ton compte."),
      p("Si ce n’est pas toi, change ton mot de passe."),
      button("Ouvrir mes paramètres", "/parametres"),
    ],
  }),
  emailChangeByTeam: (next: string): MailContent => ({
    subject: "changement d’adresse", title: "Changement d’adresse",
    blocks: [
      p(`L’équipe de {site} a demandé à remplacer l’adresse de ton compte par ${next}. Le changement n’aura lieu qu’après confirmation depuis la nouvelle adresse.`),
      note("Ce n’est pas toi qui l’as demandé ?", { label: "Préviens l’équipe", path: "/contact" }),
    ],
    contact: true,
  }),
  accessAccepted: (name: string): MailContent => ({
    subject: "ton accès est accepté", title: "Ton accès est accepté", greeting: hello(name),
    blocks: [p("Ta demande a été acceptée. Tu peux te connecter."), button("Me connecter", "/login")],
  }),
  accessRefused: (name: string): MailContent => ({
    subject: "ta demande d’accès", title: "Ta demande d’accès", greeting: hello(name),
    blocks: [p("Ta demande d’accès n’a pas été acceptée.")],
    reason: "Tu reçois ce mail parce que tu as demandé un accès à {site}.",
  }),
  accountReady: (name: string, token: string): MailContent => ({
    subject: "ton compte est prêt", title: "Ton compte est prêt", greeting: hello(name),
    blocks: [
      p("Un compte {site} vient d’être créé pour toi. Choisis ton mot de passe pour l’activer."),
      button("Activer mon compte", `/reset/${token}`),
      note("Ce lien est valable 7 jours."),
    ],
    reason: ACCOUNT_CREATED,
  }),
  teacherSpace: (token: string): MailContent => ({
    subject: "ton espace enseignant", title: "Ton espace enseignant", greeting: hello(),
    blocks: [
      p("{site} est un site d’entraide entre étudiants. Cet espace te permet de voir les documents rattachés à tes matières, et d’accorder ou de retirer ton accord."),
      p("Choisis un mot de passe pour y accéder."),
      button("Choisir mon mot de passe", `/reset/${token}`),
      note("Ce lien est valable 7 jours."),
    ],
    reason: ACCOUNT_CREATED,
  }),
  invitation: (input: { name: string | null; programName: string; message: string | null; token: string; days: number }): MailContent => ({
    subject: "ton invitation", title: "Tu es invité·e sur {site}", greeting: hello(input.name),
    blocks: [
      p(`Tu es invité·e sur {site}, le site où les étudiants${input.programName ? ` de ${input.programName}` : ""} partagent leurs cours, fiches et anciens partiels.`),
      ...(input.message ? [quote(input.message)] : []),
      button("Créer mon compte", `/invitation/${input.token}`),
      note(`Ce lien est valable ${input.days} jours.`),
    ],
    reason: "Tu reçois ce mail parce que quelqu’un t’a invité·e sur {site}. Sans suite de ta part, tu ne recevras rien d’autre.",
  }),
};

export const accessMails = {
  /** Mesure de sécurité sur un compte (titre et texte choisis par l'action). */
  warning: (name: string, title: string, text: string): MailContent => ({
    subject: title.toLowerCase(), title, greeting: hello(name), blocks: [p(text), askTeam], contact: true,
  }),
  suspended: (name: string, until: string, motive: string | null): MailContent => ({
    subject: "compte suspendu", title: "Ton compte est suspendu", greeting: hello(name),
    blocks: [
      p(`Ton compte est suspendu jusqu’au ${until}.`),
      ...(motive ? [quote(motive)] : []),
      p("Il redeviendra accessible seul à cette date."),
      askTeam,
    ],
    contact: true,
  }),
  closed: (name: string): MailContent => ({
    subject: "compte fermé", title: "Ton compte est fermé", greeting: hello(name),
    blocks: [
      p("Ton compte a été fermé par l’équipe de {site}, et cette adresse ne peut plus servir à s’inscrire."),
      note("Tu peux contester cette décision.", { label: "Écrire à l’équipe", path: "/contact" }),
    ],
    contact: true,
  }),
  deletion: (name: string, keepCourses: boolean): MailContent => ({
    subject: "suppression de ton compte", title: "Ton compte va être supprimé", greeting: hello(name),
    blocks: [
      p(`Ton compte est désactivé et sera supprimé dans 30 jours. ${keepCourses ? "Tes cours publiés resteront en ligne, signés « Ancien membre »." : "Tes cours ont été retirés."}`),
      note("Pour l’annuler, écris à l’équipe avant cette date.", { label: "Écrire à l’équipe", path: "/contact" }),
    ],
    contact: true,
  }),
  loginLink: (name: string, token: string): MailContent => ({
    subject: "lien de connexion", title: "Ton lien de connexion", greeting: hello(name),
    blocks: [
      p("Voici un lien pour te connecter en choisissant un nouveau mot de passe."),
      button("Choisir un mot de passe", `/reset/${token}`),
      note("Ce lien est valable 24 heures. Ce n’est pas toi qui l’as demandé ? Ignore ce message."),
    ],
  }),
};

export const contentMails = {
  coauthorAdded: (by: string, title: string, docId: string): MailContent => ({
    subject: "tu rejoins les auteurs d’un cours", title: "Tu rejoins les auteurs d’un cours",
    blocks: [p(`${by} t’ajoute aux auteurs de « ${title} ».`), button("Ouvrir le cours", `/editer/${docId}`)],
  }),
  proposalRejected: (title: string, comment: string | null): MailContent => ({
    subject: "ta proposition de modification", title: "Ta proposition de modification",
    blocks: [p(`Ta proposition de modification de « ${title} » n’a pas été retenue.`), ...(comment ? [p("Commentaire :"), quote(comment)] : [])],
  }),
  removedByTeacher: (title: string): MailContent => ({
    subject: "document retiré", title: "Document retiré",
    blocks: [p(`L’enseignant a demandé le retrait de « ${title} ». Il n’est plus visible.`)],
  }),
  fileRejected: (filename: string): MailContent => ({
    subject: "fichier refusé", title: "Fichier refusé",
    blocks: [p(`Ton fichier « ${filename} » a été détecté comme dangereux par l’antivirus et supprimé.`), p("Analyse ton appareil.")],
  }),
};

export const reportMails = {
  /** Un ayant droit extérieur est vouvoyé ; un étudiant, tutoyé. */
  received: (rights: boolean, trackingToken: string): MailContent => ({
    subject: "demande bien reçue", title: rights ? "Votre demande est bien reçue" : "Ta demande est bien reçue", formal: rights,
    blocks: [
      p(rights
        ? "Votre demande a bien été reçue et sera traitée rapidement. Si un contenu vous appartient et a été déposé sans votre accord, il sera retiré."
        : "Ta demande a bien été reçue et sera traitée rapidement."),
      button(rights ? "Suivre votre demande" : "Suivre ta demande", `/contact/suivi/${trackingToken}`),
    ],
    reason: rights ? "Vous recevez ce message suite à votre demande sur {site}." : "Tu reçois ce mail suite à ta demande sur {site}.",
  }),
  handled: (rights: boolean, accepted: boolean, response: string | null, trackingToken: string | null): MailContent => ({
    subject: `${rights ? "votre" : "ta"} demande a été traitée`, title: `${rights ? "Votre" : "Ta"} demande a été traitée`, formal: rights,
    blocks: [
      p(`${rights ? "Votre" : "Ta"} demande a été traitée : ${accepted ? "elle a été acceptée" : "elle n’a pas été retenue"}.`),
      ...(response ? [p("Réponse :"), quote(response)] : []),
      ...(trackingToken ? [button(rights ? "Suivre votre demande" : "Suivre ta demande", `/contact/suivi/${trackingToken}`)] : []),
    ],
    reason: rights ? "Vous recevez ce message suite à votre demande sur {site}." : "Tu reçois ce mail suite à ta demande sur {site}.",
    contact: true,
  }),
};

export const adminMails = {
  testMail: (): MailContent => ({
    subject: "test d’envoi", title: "Test d’envoi",
    blocks: [p("L’envoi de mails fonctionne."), note("Ce mail a été demandé depuis l’administration.")],
  }),
  newAccessRequest: (input: { name: string; email: string; program: string | null; level: number | null; message: string | null }): MailContent => ({
    subject: `nouvelle demande d’accès de ${input.name}`, title: "Nouvelle demande d’accès",
    blocks: [
      p(`${input.name} demande un accès.`),
      facts([
        { label: "Adresse", value: input.email },
        { label: "Licence", value: `${input.program ?? "non renseignée"}${input.level ? `, L${input.level}` : ""}` },
      ]),
      ...(input.message ? [p("Message :"), quote(input.message)] : []),
      button("Accepter ou refuser", "/admin/personnes"),
    ],
  }),
  alert: (title: string, body: string, href: string): MailContent => ({
    subject: title.charAt(0).toLowerCase() + title.slice(1), title, blocks: [p(body), button("Ouvrir", href)],
  }),
  newReport: (): MailContent => ({
    subject: "nouveau signalement", title: "Nouveau signalement",
    blocks: [p("Un message attend ta réponse."), button("Répondre", "/admin/moderation")],
  }),
  autoHidden: (title: string): MailContent => ({
    subject: "document retiré automatiquement", title: "Document retiré automatiquement",
    blocks: [p(`« ${title} » a reçu plusieurs signalements de droit d’auteur. Il est masqué en attendant ta décision.`), button("Décider", "/admin/moderation")],
  }),
  messageReported: (docId: string): MailContent => ({
    subject: "message signalé", title: "Message signalé",
    blocks: [p("Un message a été signalé."), button("Voir le message", `/d/${docId}#questions`)],
  }),
  editToReview: (title: string): MailContent => ({
    subject: "modification à relire", title: "Modification à relire",
    blocks: [p(`Une proposition de modification de « ${title} » attend sa relecture.`), button("Relire", "/moderation")],
  }),
  withdrawalToReview: (title: string): MailContent => ({
    subject: "demande de retrait d’un cours", title: "Demande de retrait d’un cours",
    blocks: [p(`L’auteur de « ${title} » demande son retrait de la publication.`), button("Traiter la demande", "/admin/moderation?onglet=retraits")],
  }),
  courseToValidate: (title: string, docId: string): MailContent => ({
    subject: "un cours attend ta validation", title: "Un cours attend ta validation",
    blocks: [p(`« ${title} » attend ta relecture.`), button("Relire", `/d/${docId}`)],
  }),
  teacherDecision: (teacher: string, authorized: boolean, title: string, docId: string): MailContent => ({
    subject: "décision d’un enseignant", title: "Décision d’un enseignant",
    blocks: [p(`${teacher} a ${authorized ? "autorisé" : "refusé"} « ${title} ».`), button("Voir le document", `/d/${docId}`)],
  }),
  infectedFile: (filename: string, title: string, virus: string): MailContent => ({
    subject: "fichier infecté supprimé", title: "Fichier infecté supprimé",
    blocks: [p(`« ${filename} » (document « ${title} ») contenait ${virus}. Il a été supprimé.`)],
  }),
};

export type NotificationMail = {
  subject: string;
  /** Texte brut, paragraphes séparés par une ligne vide. Échappé au rendu. */
  text: string;
  /** Message écrit par quelqu'un : cité tel quel, à part. */
  quote?: string;
  /** Libellé du bouton qui ouvre la notification. */
  action?: string;
  // Une décision sur le travail de quelqu'un, avec son motif : le mail part même si le rappel du jour est pris
  transactional?: boolean;
};

/** Le mail d'une notification : son texte, puis un bouton qui l'ouvre (et la marque lue). */
export function notificationMailContent(mail: NotificationMail, notificationId: string): MailContent {
  return {
    subject: mail.subject,
    title: mail.subject.charAt(0).toUpperCase() + mail.subject.slice(1),
    blocks: [
      ...mail.text.trim().split(/\n{2,}/).map((text) => p(text)),
      ...(mail.quote ? [quote(mail.quote)] : []),
      button(mail.action ?? "Ouvrir", `/notifications/ouvrir/${notificationId}`),
    ],
  };
}
