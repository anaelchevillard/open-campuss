import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { JsonLd } from "@/components/json-ld";
import { LegalShell } from "@/components/legal-shell";
import { aiProvider } from "@/components/landing/rules";
import { env } from "@/lib/env";
import { breadcrumbLd, publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({ path: "/confidentialite", title: "Confidentialité et cookies", description: "Données traitées par Campuss, durées de conservation, prestataires, cookies et droits RGPD : ce que le site fait de vos informations, et comment les télécharger ou les effacer." });

/** Rendue à la demande : figée au build, elle garderait le fournisseur d’IA de ce moment-là, quel que soit app.env. */
export default async function PrivacyPage() {
  await connection();
  // Nommé d'après AI_BASE_URL : la politique suit le fournisseur réellement configuré
  const ai = aiProvider(env.aiBaseUrl);
  return (
    <>
      <JsonLd data={breadcrumbLd("/confidentialite", "Confidentialité et cookies")} />
      <LegalShell title="Confidentialité et cookies" updated="novembre 2026">
        <p>Campuss ne vend aucune donnée et ne contient ni publicité ni outil de suivi de Google ou d’un autre tiers. La mesure d’audience est interne, et le suivi individuel n’a lieu que si vous l’acceptez.</p>

        <h2>Responsable du traitement</h2>
        <p>{env.legalPublisher ? `${env.legalPublisher}, ` : "L’administrateur de Campuss, "}joignable depuis la page <Link href="/contact">Nous écrire</Link>.</p>

        <h2>Données utilisées</h2>
        <table>
          <thead><tr><th>Données</th><th>Pourquoi</th><th>Base légale</th><th>Durée</th></tr></thead>
          <tbody>
            <tr><td>Nom, adresse mail, licence, année, mot de passe chiffré</td><td>Créer et sécuriser le compte, limiter l’accès à la licence</td><td>Exécution des conditions d’utilisation</td><td>Jusqu’à la suppression du compte, ou 3 ans sans connexion, après un mail d’avertissement</td></tr>
            <tr><td>Demande sans mail confirmé</td><td>Vérifier l’adresse</td><td>Exécution des conditions</td><td>3 jours</td></tr>
            <tr><td>Demande refusée</td><td>Éviter les demandes répétées</td><td>Intérêt légitime</td><td>6 mois</td></tr>
            <tr><td>Photo, description, pronoms, matière préférée</td><td>Votre profil, facultatif, visible dans votre licence</td><td>Votre choix</td><td>Jusqu’à ce que vous les retiriez</td></tr>
            <tr><td>Contenus partagés, mercis, documents révisés, badges</td><td>Faire fonctionner le partage et le jeu</td><td>Exécution des conditions</td><td>Jusqu’à la suppression du compte ; les contenus publiés restent, sans votre nom</td></tr>
            <tr><td>Session : navigateur, appareil et adresse IP ; empreinte des appareils déjà connus</td><td>Garder la connexion, afficher vos appareils, vous prévenir d’une connexion depuis un nouvel appareil</td><td>Exécution des conditions</td><td>Session : 30 jours au maximum, ou jusqu’à la déconnexion. Appareils connus : jusqu’à la suppression du compte</td></tr>
            <tr><td>Secret de double authentification chiffré, clés d’accès, empreintes des codes de secours</td><td>Protéger le compte, si vous activez ces options</td><td>Votre choix</td><td>Jusqu’à ce que vous les retiriez, ou à la suppression du compte</td></tr>
            <tr><td>Surlignages, notes et photos de révision sur un cours</td><td>Vos révisions, visibles par vous et les amis que vous invitez</td><td>Exécution des conditions</td><td>Jusqu’à ce que vous les retiriez, à la suppression du cours ou du compte</td></tr>
            <tr><td>Liens d’amitié, demandes et code d’invitation</td><td>Réviser avec les personnes que vous choisissez</td><td>Exécution des conditions</td><td>Jusqu’au retrait du lien ou à la suppression du compte</td></tr>
            <tr><td>Notes données aux cours, demandes de cours et votes, notes prises à plusieurs</td><td>Améliorer les cours et les écrire ensemble</td><td>Exécution des conditions</td><td>Jusqu’à la suppression du compte ; une demande ou un cours écrit à plusieurs reste, sans votre nom. L’état de travail en temps réel est effacé à la clôture, ou après 30 jours sans activité</td></tr>
            <tr><td>Votre nom sur les PDF que vous téléchargez</td><td>Dissuader la rediffusion</td><td>Intérêt légitime</td><td>Rien n’est conservé : le nom ne figure que dans votre copie</td></tr>
            <tr><td>Présence dans le classement</td><td>Afficher votre rang</td><td>Votre consentement, retirable à tout moment</td><td>Jusqu’au retrait</td></tr>
            <tr><td>Adresse IP et actions sensibles (connexion, modifications)</td><td>Sécurité, lutte contre les abus</td><td>Intérêt légitime</td><td>1 an au maximum ; compteurs anti-abus : 2 jours</td></tr>
            <tr><td>Pages vues, type d’appareil et navigateur, site d’origine, sans adresse IP ni identifiant</td><td>Statistiques anonymes du site</td><td>Intérêt légitime</td><td>25 mois</td></tr>
            <tr><td>Pages consultées et fichiers ouverts, liés à votre compte et à un identifiant de visiteur</td><td>Comprendre l’usage, assister les utilisateurs. Visible par les administrateurs</td><td>Votre consentement, retirable à tout moment</td><td>Lien avec vous supprimé après 6 mois, ou dès votre retrait</td></tr>
            <tr><td>Temps passé sur chaque page et recherches restées sans résultat (texte réduit, sans adresse ni numéro), en totaux par jour, sans identifiant ni lien avec vous</td><td>Savoir quels cours sont vraiment lus et lesquels manquent</td><td>Votre consentement (même choix que la mesure d’audience)</td><td>Durées : 25 mois. Recherches : 1 an</td></tr>
            <tr><td>Erreurs techniques du site : type d’erreur, message et pile nettoyés (adresses mail, jetons, mots de passe, paramètres d’adresse, numéros et adresses IP retirés), page sans ses paramètres, famille du navigateur et du système, version du site. Ni compte, ni cookie, ni contenu de formulaire, ni identifiant d’appareil. Pour estimer le nombre de personnes touchées dans la journée, une empreinte de l’adresse IP et du navigateur est calculée avec une clé tirée au hasard chaque jour et jamais conservée : elle ne permet pas de vous retrouver ni de vous suivre d’un jour à l’autre</td><td>Repérer et corriger les pannes, sécurité du site. Visible par les administrateurs</td><td>Intérêt légitime (envoyé même si vous refusez la mesure d’audience)</td><td>90 jours</td></tr>
            <tr><td>Actions principales sur le site (inscription, première visite du jour, cours ouvert, fiche créée ou importée, séance de révision, quiz, partiel blanc, cours envoyé, paquet publié), en totaux par jour, sans identifiant ni lien avec vous</td><td>Savoir quelles fonctions servent vraiment</td><td>Intérêt légitime</td><td>25 mois</td></tr>
            <tr><td>Les mêmes actions liées à votre compte (nom de l’action et date)</td><td>Mesurer qui revient après 1, 7 ou 30 jours (courbes de rétention). Les administrateurs ne voient que des totaux</td><td>Votre consentement (même choix que la mesure d’audience) ; le retrait les efface</td><td>13 mois. Elles figurent dans l’export de vos données</td></tr>
            <tr><td>Engagements cochés (texte, date, adresse IP, document, nom et adresse mail)</td><td>Prouver les déclarations relatives aux droits d’auteur et se défendre en cas de litige</td><td>Intérêt légitime</td><td>5 ans, y compris après la suppression du compte</td></tr>
            <tr><td>Favoris, progression de lecture, fiches mémo, scores de quiz</td><td>Vos révisions. Privés, visibles par vous seul</td><td>Exécution des conditions</td><td>Jusqu’à la suppression du compte</td></tr>
            <tr><td>Jours de révision, objectif du jour, défis de quiz, groupes et rendez-vous de révision</td><td>Vos habitudes de révision. Un score de défi n’est visible que des joueurs, un groupe que de ses membres</td><td>Exécution des conditions</td><td>Jusqu’à la suppression du compte</td></tr>
            <tr><td>Lien de parrainage utilisé à l’inscription</td><td>Créditer la personne qui vous a invité, qui ne voit qu’un nombre, jamais votre nom</td><td>Intérêt légitime</td><td>Jusqu’à la suppression de votre compte, puis sans lien avec vous</td></tr>
            <tr><td>Questions et réponses</td><td>Entraide, visible dans votre licence</td><td>Exécution des conditions</td><td>Jusqu’à leur retrait ; restent sans votre nom après la suppression du compte</td></tr>
            <tr><td>Notifications reçues, ouvertures (comptées seulement en totaux pour les administrateurs)</td><td>Vous prévenir, mesurer l’utilité des rappels</td><td>Intérêt légitime</td><td>90 jours</td></tr>
            <tr><td>Abonnement aux notifications d’un appareil, transmis au service de push de votre navigateur (Apple, Google, Mozilla ou Microsoft)</td><td>Envoyer un rappel sur cet appareil</td><td>Votre consentement, retirable dans Mon compte</td><td>Jusqu’au retrait, à l’expiration de l’abonnement côté navigateur ou à la suppression du compte</td></tr>
            <tr><td>Résumé hebdomadaire par mail</td><td>Vous dire ce qui vous attend</td><td>Intérêt légitime, désinscription en un clic dans chaque mail</td><td>Jusqu’à la désinscription</td></tr>
            <tr><td>Messages et signalements</td><td>Y répondre, retirer un contenu</td><td>Intérêt légitime</td><td>1 an après leur traitement</td></tr>
            <tr><td>Notes internes des administrateurs sur votre compte</td><td>Suivre une modération ou une demande d’aide d’un administrateur à l’autre</td><td>Intérêt légitime</td><td>Jusqu’à leur retrait ou à la suppression du compte. Elles figurent dans l’export de vos données</td></tr>
            <tr><td>Suspension : date de fin, motif et message affiché</td><td>Faire respecter les conditions d’utilisation. Vous êtes prévenu par mail et le message s’affiche à la connexion</td><td>Intérêt légitime</td><td>Jusqu’à la suppression du compte ; la suspension cesse seule à sa date de fin ou quand un administrateur la lève</td></tr>
            <tr><td>Bannissement : empreinte chiffrée (HMAC) de l’adresse mail et motif, jamais l’adresse elle-même</td><td>Empêcher une nouvelle inscription avec une adresse bannie. Vous êtes prévenu par mail</td><td>Intérêt légitime</td><td>3 ans au plus, ou jusqu’à la réactivation du compte</td></tr>
          </tbody>
        </table>
        <p>Les sauvegardes de la base sont conservées 14 jours sur le serveur. Quand la sauvegarde hors site est active, une copie chiffrée est gardée jusqu’à 6 mois environ, chez le prestataire de stockage choisi (Google Drive). Ces copies peuvent donc contenir des données supprimées entre-temps.</p>

        <h2>Qui y a accès</h2>
        <ul>
          <li>Les étudiants de votre licence voient votre profil et vos partages. Votre adresse mail n’est jamais affichée.</li>
          <li>Les administrateurs de Campuss voient les comptes pour les gérer et, si vous l’avez accepté, les pages que vous consultez. Pour vous aider ou vérifier un problème, un administrateur peut aussi afficher le site tel que vous le voyez, en lecture seule, 15 minutes au plus : chaque aperçu est enregistré dans le journal d’administration, avec les pages vues, mais vous n’en êtes pas forcément prévenu. De même, une modification de votre compte par un administrateur est toujours journalisée, sans vous être forcément signalée. En revanche, une suspension, un bannissement, la réinitialisation de votre second facteur ou la suppression de votre compte vous sont toujours signalés par mail. Les administrateurs peuvent aussi tenir des notes internes sur un compte ; elles ne s’affichent pas sur le site mais figurent dans l’export de vos données.</li>
          <li><strong>Amazon SES</strong> (Amazon Web Services) envoie les mails du site (adresse et contenu du mail), depuis un centre de données de l’Union européenne. Un mail envoyé quitte aussitôt notre file d’attente ; un mail qui ne part pas en est effacé après 7 jours. Amazon est une société américaine : ses engagements de protection des données prévus par le RGPD s’appliquent.</li>
          <li><strong>{ai.name}</strong>{ai.host && ai.host !== ai.name ? ` (${ai.host})` : ""}, le fournisseur de Campuss IA, reçoit seulement des contenus de cours, jamais votre nom, votre adresse mail ni votre compte : la photo de notes que vous lui confiez pour la transcrire (sans ses métadonnées, dont le GPS), le nom et le début du texte d’un fichier que vous déposez pour proposer son titre, sa matière, son type et son chapitre, et le texte d’un cours publié pour en tirer un quiz, ou des fiches mémo si un étudiant le demande ou qu’un relecteur les régénère. Les adresses mail présentes dans ces textes sont retirées avant l’envoi. Évitez tout de même d’y laisser des données personnelles.{ai.host.endsWith("googleapis.com") ? " Campuss utilise l’offre payante de l’API Gemini : Google ne s’en sert pas pour entraîner ses modèles et ne garde les requêtes que le temps limité prévu par ses conditions, pour détecter les abus. Les serveurs de Google peuvent se trouver hors de l’Union européenne ; ses engagements de protection des données prévus par le RGPD s’appliquent." : ""} Le site ne garde de ces appels que des totaux anonymes par jour (nombre d’appels et volume traité) pour en suivre le coût.</li>
          <li><strong>Have I Been Pwned</strong> vérifie qu’un mot de passe n’a pas fuité : seuls les 5 premiers caractères de son empreinte sont envoyés, jamais le mot de passe ni votre adresse.</li>
          {env.turnstileEnabled && <li><strong>Cloudflare Turnstile</strong> vérifie, au moment de l’inscription seulement, que la demande vient d’une personne : votre navigateur charge son contrôle et le serveur lui transmet le résultat avec votre adresse IP.</li>}
          <li><strong>Notion</strong> est interrogé uniquement par le serveur, pour copier une page choisie par un administrateur.</li>
          <li><strong>Google Drive :</strong> une copie des cours publiés et de leurs pièces jointes, sans le nom de leur auteur, peut être synchronisée vers un Drive tenu par l’administrateur. Un cours retiré du site y part à la corbeille.</li>
          {env.trustedIpHeader && <li><strong>Cloudflare</strong> protège le site contre les attaques : tout le trafic passe par ce service, situé aux États-Unis et s’appuyant sur des garanties de transfert prévues par le RGPD. Il voit votre adresse IP et, le temps du passage, le contenu échangé. Il ne conserve pas les pages privées.</li>}
          <li><strong>Annotations :</strong> vos surlignages, notes et photos ne sont visibles que par vous et les amis que vous invitez et qui acceptent. Les administrateurs du serveur y ont un accès technique, mais aucune page du site ne les affiche.</li>
          <li><strong>Amis :</strong> votre liste d’amis n’est visible que par vous. Les inscrits peuvent vous trouver par votre nom dans la page Amis (ceux qui ne sont pas vos amis voient votre prénom et l’initiale de votre nom, jamais votre adresse), sauf si vous désactivez « Me trouver par mon nom » dans vos réglages de confidentialité. Une demande d’ami s’accepte ou se refuse ; en revanche, la personne qui ouvre un lien d’invitation que vous avez créé (ou son QR code) devient aussitôt votre amie.</li>
          <li><strong>Dossier connecté (facultatif) :</strong> si vous reliez un dossier Google Drive ou une page Notion, le serveur conserve un jeton d’accès chiffré, en lecture seule pour Google, et le titre des notes trouvées dans ce dossier, une fois par semaine. Un fichier n’est lu que si vous choisissez de l’importer, et rien n’est publié sans votre action. Vous pouvez tout déconnecter en un clic, ce qui révoque l’accès et efface le jeton et cette liste ; il en va de même à la suppression du compte. Le jeton n’est jamais exporté ni montré. Google et Notion sont situés aux États-Unis.</li>
          <li><strong>Import de notes :</strong> le fichier envoyé est converti puis n’est pas conservé ; seuls le texte et les images obtenus restent, dans votre brouillon.</li>
          <li><strong>YouTube :</strong> une vidéo insérée dans un cours se charge depuis youtube-nocookie.com ; votre navigateur communique alors votre adresse IP à ce service.</li>
          <li>Le site est hébergé sur un serveur auto-géré : vos données y sont stockées, sans hébergeur tiers.</li>
        </ul>
        <p>Certaines pages interactives (artefacts) et formules peuvent charger des bibliothèques depuis esm.sh, jsDelivr ou Tailwind : votre navigateur leur communique alors votre adresse IP. Elles s’exécutent isolées du reste du site, sans accès à votre compte.</p>

        <h2>Vos droits</h2>
        <p>Vous pouvez accéder à vos données, les corriger, les supprimer, les récupérer, vous opposer à certains traitements ou en demander la limitation.</p>
        <ul>
          <li><strong>Télécharger vos données et supprimer votre compte :</strong> depuis <Link href="/parametres/compte#donnees">Mon compte</Link>, sans avoir à le demander.</li>
          <li><strong>Pour le reste :</strong> <Link href="/contact">écrivez-nous</Link>. Réponse sous un mois.</li>
          <li><strong>Réclamation :</strong> vous pouvez saisir la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">CNIL</a>.</li>
        </ul>

        <h2 id="cookies">Cookies</h2>
        <p>Aucun cookie de publicité ou de réseau social, et rien ne part chez un tiers. Les cookies nécessaires au service sont déposés sans demande. Le cookie de suivi n’est déposé que si vous l’acceptez ; le refus n’a aucune conséquence sur le site. Vous pouvez changer d’avis avec « Gérer les cookies », en bas de chaque page.</p>
        <table>
          <thead><tr><th>Nom</th><th>Rôle</th><th>Durée</th></tr></thead>
          <tbody>
            <tr><td><code>__Host-campus</code></td><td>Garder votre session ouverte</td><td>30 jours</td></tr>
            <tr><td><code>campuss-prefs</code></td><td>Retenir vos réglages d’affichage (thème, taille du texte, police)</td><td>1 an</td></tr>
            <tr><td><code>campuss-consent</code></td><td>Retenir votre choix sur le suivi</td><td>6 mois</td></tr>
            <tr><td><code>sidebar_state</code></td><td>Retenir si le menu latéral est ouvert ou fermé</td><td>7 jours</td></tr>
            <tr><td><code>campuss-visitor</code></td><td>Suivi des pages visitées. Uniquement si vous l’acceptez</td><td>13 mois</td></tr>
          </tbody>
        </table>
      </LegalShell>
    </>
  );
}
