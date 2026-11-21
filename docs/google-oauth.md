# Google Docs : connexion OAuth et vérification Google

Campuss importe un Google Doc en un clic depuis l'éditeur (tuile « Google Docs », sélecteur avec recherche) et peut proposer chaque semaine les documents modifiés (Paramètres › Comptes connectés). Sans `GOOGLE_OAUTH_CLIENT_ID` et `GOOGLE_OAUTH_CLIENT_SECRET`, ou avec l'interrupteur `features.imports` coupé, rien de tout cela n'apparaît.

## Ce que Campuss demande

- Périmètre : `https://www.googleapis.com/auth/drive.readonly` (lecture seule de tout le Drive). Il sert à lister les Google Docs (`files.list`, Docs non supprimés, `name contains`, `modifiedTime desc`, 25 par page), à lire l'adresse du compte (`about.get`) et à exporter un Doc en Word (`files.export`) pour le convertir.
- `access_type=offline` et `prompt=consent` : sans jeton de renouvellement, la proposition hebdomadaire ne tournerait qu'une heure.
- Jetons chiffrés (AES-256-GCM, clé dérivée de `SECRET_KEY`), jamais exportés, révoqués à la déconnexion et à la suppression du compte.
- Aucune écriture dans le Drive, aucun script Google chargé dans le navigateur (pas de Picker).

## Configuration

1. Google Cloud Console › nouveau projet « Campuss ».
2. API et services › Bibliothèque : activer **Google Drive API**.
3. Écran de consentement OAuth : type **Externe** ; nom « Campuss », logo, adresse d'assistance, domaine autorisé `campuss.fr`, liens vers `https://campuss.fr/confidentialite` et `https://campuss.fr/cgu` ; périmètre `.../auth/drive.readonly`.
4. Identifiants › ID client OAuth › Application Web ; URI de redirection autorisée : `https://campuss.fr/api/connected/google/callback` (et l'équivalent de préproduction).
5. Dans `app.env` : `GOOGLE_OAUTH_CLIENT_ID=…`, `GOOGLE_OAUTH_CLIENT_SECRET=…`, puis redémarrer.

## Mode « test » (sans vérification)

Tant que l'application n'est pas vérifiée, l'écran de consentement reste en statut **Test** :

- seuls les **comptes déclarés** dans « Utilisateurs test » (100 au plus) peuvent se connecter ; les autres voient « Accès bloqué » ;
- l'autorisation **expire au bout de 7 jours** (jeton de renouvellement révoqué) : le compte passe en « À reconnecter » dans Campuss, qui le signale par une notification ;
- l'écran affiche « Google n'a pas validé cette application ».

C'est suffisant pour l'essai avec quelques délégués. Pour toute la promotion, il faut la vérification.

## Vérification (périmètre restreint)

`drive.readonly` est un périmètre **restreint**. La publication de l'application demande :

1. **Vérification de la marque et du domaine** : domaine `campuss.fr` validé dans Google Search Console par le même compte ; page d'accueil publique décrivant Campuss ; politique de confidentialité qui nomme les données Google lues, leur usage (import d'un cours choisi par l'étudiant, proposition hebdomadaire activée par lui), leur conservation (aucune copie du fichier d'origine, seul le cours converti reste) et la conformité à la « Google API Services User Data Policy », y compris les « Limited Use requirements ».
2. **Justification du périmètre** : expliquer pourquoi `drive.file` ne suffit pas (recherche et liste des Docs dans Campuss, proposition hebdomadaire sans action de l'étudiant).
3. **Vidéo de démonstration** (YouTube, non répertoriée) : écran de consentement en anglais avec l'ID client visible dans l'URL, connexion depuis Paramètres › Comptes connectés, sélecteur dans l'éditeur, import d'un Doc, interrupteur hebdomadaire, déconnexion.
4. **Évaluation de sécurité annuelle** (CASA, Cloud Application Security Assessment) par un évaluateur agréé : questionnaire, analyse du code et de l'infrastructure, renouvelée chaque année. Coût variable selon l'évaluateur (de quelques centaines à plusieurs milliers d'euros), délai de plusieurs semaines.

Compter 4 à 8 semaines entre la soumission et l'accord. Sans réponse aux questions de l'équipe Google sous 30 jours, la demande est close.

## Alternative si la vérification est refusée ou trop coûteuse : `drive.file` + Picker

`drive.file` est un périmètre **non sensible** : pas d'évaluation de sécurité, vérification de la marque seulement. Campuss ne voit alors que les fichiers que l'étudiant choisit lui-même dans le **Google Picker**.

Ce qu'il faut changer :

- `GOOGLE_SCOPE` (`src/lib/connected/providers.ts`) → `https://www.googleapis.com/auth/drive.file` ;
- le sélecteur Google devient le Picker : il charge `https://apis.google.com/js/api.js`, contraire à la règle « aucun script tiers ». Le charger **au clic seulement**, dans une page isolée (`/connecter/google`, avec sa propre CSP qui autorise `apis.google.com` et `docs.google.com` en `frame-src`), qui renvoie l'identifiant choisi à l'éditeur par `postMessage` ;
- la proposition hebdomadaire n'est plus possible pour Google (Campuss ne voit pas les nouveaux documents) : l'interrupteur disparaît pour ce service ;
- la recherche intégrée reste réservée à Notion.

Notion ne demande aucune vérification : l'étudiant choisit les pages partagées pendant l'autorisation, et « Donner accès à d'autres pages » relance la connexion.
