<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/mail/logo-dark@2x.png" />
    <img src="public/mail/logo-light@2x.png" alt="Campuss" width="220" />
  </picture>
</p>

<p align="center">
  Les cours de ta licence, écrits et révisés par ta promo.
</p>

<p align="center">
  <a href="https://campuss.fr">Accéder à Campuss</a> ·
  <a href="#démo">Démo</a> ·
  <a href="#démarrer">Développer</a> ·
  <a href="docs/SELF_HOSTING.md">Auto-héberger</a>
</p>

Campuss est une plateforme où les étudiants d'une licence partagent leurs cours, fiches, TD corrigés et anciens
partiels, puis les révisent ensemble. C'est un **projet étudiant libre, indépendant et non officiel** : campuss.fr est
une initiative étudiante indépendante, sans lien officiel avec l’Université Bourgogne Europe.

## Ce que propose Campuss

| Espace | Fonctionnalités |
| --- | --- |
| **Cours** | Éditeur riche (BlockNote) avec formules, graphiques, figures TikZ et artefacts HTML isolés ; dépôt de PDF et de photos ; imports Word, Markdown, Evernote, Notion et Google Docs ; co-auteurs, versions, relecture avant publication. |
| **Lecture** | Page centrée, surlignage et notes en marge, notes partagées entre amis en temps réel, réglages de lecture (taille, interligne, OpenDyslexic, Atkinson Hyperlegible), thèmes clair et sombre. |
| **Réviser** | Fiches en répétition espacée (FSRS), import Anki, Quizlet ou tableur, quiz, partiels et contrôles continus avec compte à rebours, partiel blanc, statistiques personnelles. |
| **Entraide** | Amis, défis, questions-réponses, demandes de cours, notifications dans l'application, par mail et en push. |
| **Campuss IA** (facultatif) | Transcription de notes photographiées, classement d'un dépôt, fiches et quiz tirés d'un cours ; toute API compatible OpenAI, budget quotidien plafonné. |
| **Administration** | Licences, années et matières, inscriptions et invitations, modération et signalements, journal, statistiques sans identifiant, erreurs du site, santé du système. |
| **Sécurité** | Argon2id, second facteur (TOTP, clés d'accès), CSP stricte à nonce, fichiers servis sur une origine isolée, antivirus ClamAV facultatif, limites de débit, export et suppression du compte. |

Campuss fonctionne dans le navigateur, au téléphone comme à l'ordinateur, et s'installe comme une application (PWA).

## Démo

Une instance séparée, avec ses propres comptes et cours, tous fictifs : **https://demo.campuss.fr**

| Champ | Valeur |
| --- | --- |
| Adresse mail | `lina_morel@etu.exemple.fr` |
| Mot de passe | `vitrine-demo-campuss-2026` |

Les données sont remises à zéro chaque nuit. Le même jeu de démonstration se charge en local avec `npm run demo:seed`.
Avec `DEMO_MODE=1` dans `.env`, une instance devient une démo : identifiants affichés à la connexion, compte protégé côté serveur, site en noindex.

## Démarrer

Prérequis : Docker avec Docker Compose v2 et Node.js 22 (pour `npm run setup`), environ 2 Go de mémoire libre.

```sh
git clone <adresse de ce dépôt> campuss && cd campuss
npm run setup            # crée .env : secrets aléatoires, adresse du site, mail de l'administrateur
docker compose up -d     # application, PostgreSQL et MinIO ; migrations appliquées au démarrage
```

Ouvrir http://localhost:3000. Le mot de passe provisoire de l'administrateur s'affiche avec `npm run admin:password` ; il
est à changer à la première connexion. `npm run demo:seed` remplit ensuite la base avec le jeu de démonstration.

### Développement

```sh
npm ci
docker compose -f compose.dev.yaml up -d   # base, MinIO et mailpit seulement
npm run dev                                # http://localhost:3000, rechargement à chaud
```

Les mails de développement arrivent dans mailpit (http://localhost:8025, voir `.env.example`).

### Commandes

| Commande | Rôle |
| --- | --- |
| `npm run setup` | Crée `.env` depuis `.env.example`. N'écrase jamais un `.env` existant. |
| `docker compose up -d` | Construit l'image et lance Campuss sur le port `CAMPUS_PORT` (3000). |
| `npm run admin:password` | Affiche le mot de passe provisoire du premier administrateur. |
| `npm run demo:seed` | Charge le jeu de démonstration fictif dans une base sans comptes. |
| `docker compose logs -f web` | Journaux de l'application. |
| `docker compose --profile antivirus up -d` | Lance aussi ClamAV (`CLAMAV_HOST=clamav` dans `.env`). |
| `npm run dev` | Serveur de développement (avec `compose.dev.yaml`). |
| `npm run lint` | ESLint. |
| `npm run typecheck` | Types TypeScript. |
| `npm test` | Tests Vitest. |
| `npm run build` | Build de production (bibliothèques des artefacts, temps réel, TikZ, puis Next.js). |

## Architecture

Next.js 16 (App Router, actions serveur), React 19, TypeScript, Tailwind CSS 4, shadcn/ui et ReUI, PostgreSQL avec
Drizzle ORM, stockage S3 (MinIO par défaut), Yjs et Hocuspocus pour le temps réel, Vitest.

```text
Navigateur (React, PWA)
    │  HTTPS, derrière un proxy inverse (Caddy, Traefik…)
Next.js + Hocuspocus (/collab), un seul processus Node
    ├── PostgreSQL       comptes, cours, révisions, journal
    ├── MinIO ou S3      fichiers, images, copies des cours publiés
    ├── ClamAV           analyse des fichiers déposés (facultatif)
    ├── SMTP             mails (facultatif)
    └── API d'IA         Campuss IA, toute API compatible OpenAI (facultatif)
```

| Dossier | Rôle |
| --- | --- |
| `src/app/` | Pages, routes d'API (`api/`) et actions serveur (`actions/`). |
| `src/components/` | Interface ; `ui/` (shadcn/ui) et `reui/` (ReUI) pour les composants de base. |
| `src/lib/` | Logique métier : accès (`access.ts`), authentification, mails, IA (`ai/`), stockage, tâches de fond. |
| `src/lib/db/` | Schéma Drizzle, un fichier par domaine. |
| `src/collab/`, `src/rich-worker/` | Serveur temps réel ; rendu TikZ dans un fil à part. |
| `src/proxy.ts` | En-têtes de sécurité et CSP de chaque requête. |
| `drizzle/` | Migrations SQL, appliquées au démarrage. |
| `public/`, `fonts/` | Fichiers servis et polices auto-hébergées. |
| `scripts/` | Installation, build et jeu de démonstration. |
| `tests/` | Tests unitaires et d'intégration (Vitest), parcours de navigateur (`e2e.mjs`). |

Plus de détails : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Charte graphique : [`DESIGN.md`](DESIGN.md).

## Configuration

Toute la configuration passe par `.env`, documenté ligne par ligne dans [`.env.example`](.env.example).

| Variable | Effet |
| --- | --- |
| `BASE_URL` | Adresse publique du site. |
| `SECRET_KEY` | Clé des sessions et des secrets chiffrés (32 caractères au moins). |
| `ADMIN_EMAIL` | Premier administrateur, créé au premier démarrage. |
| `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `S3_APP_SECRET` | Secrets de la base et du stockage. |
| `ORGANIZATION_NAME`, `UNIVERSITY_NAME`… | Établissement et université affichés sur la présentation et les pages d'information. |
| `AUTO_APPROVE_DOMAINS` | Domaines étudiants admis à l'inscription sans relecture. |
| `SMTP_*` | Envoi des mails. Sans SMTP, l'administrateur crée et valide les comptes. |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Campuss IA. Sans clé, l'IA n'apparaît pas. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Notifications push. |
| `CLAMAV_HOST` | Antivirus. |
| `CONTENT_ORIGIN` | Origine séparée pour les contenus déposés (recommandé en production). |

Les fonctions facultatives restent invisibles tant que leurs variables sont vides. Google Docs :
[`docs/google-oauth.md`](docs/google-oauth.md).

## Données et vie privée

- **Stocké** : comptes, cours, annotations, fiches et révisions dans PostgreSQL ; fichiers et images dans MinIO.
  Rien ne part chez un tiers, sauf les services que vous configurez (SMTP, API d'IA, captcha).
- **Protégé** : mots de passe en Argon2id ; jetons de session et codes de secours en empreintes ; secret TOTP chiffré
  (AES-256-GCM). Le reste de la base et les fichiers ne sont pas chiffrés par l'application : chiffrez le disque.
- **Accès** : un étudiant ne voit que les contenus de sa licence, par une règle unique côté serveur (`src/lib/access.ts`).
- **Mesure d'audience** interne, sans service extérieur : sans consentement, des totaux anonymes, sans cookie ni
  adresse IP ; avec consentement, les pages vues liées au compte, effacées à 6 mois ou au retrait de l'accord.
- **Conservation** appliquée par une tâche de fond horaire : journal 1 an, comptes sans connexion 3 ans. Chacun exporte
  ses données et supprime son compte depuis ses paramètres.
- **Campuss IA** ne reçoit jamais le nom ni le compte de l'étudiant.

## Auto-hébergement

Une instance de production tourne derrière un proxy HTTPS (Caddy ou Traefik), avec des sauvegardes de la base et des
fichiers. Le guide [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) couvre l'installation, le proxy, les sauvegardes et les
mises à jour.

## Contribuer

Les contributions sont bienvenues : voir [`CONTRIBUTING.md`](CONTRIBUTING.md) et le
[code de conduite](CODE_OF_CONDUCT.md). Une faille de sécurité se signale en privé : [`SECURITY.md`](SECURITY.md).

## Licence

Campuss est distribué sous **GNU AGPL-3.0-or-later** ([`LICENSE`](LICENSE)) : si vous proposez une version modifiée
comme service en ligne, vous devez en publier le code source pour ses utilisateurs.

Les ressources tierces gardent leurs licences :

- Polices : Source Sans 3, Source Serif 4, Atkinson Hyperlegible Next, OpenDyslexic, Barlow Condensed, Caveat,
  JetBrains Mono et Nunito, sous SIL OFL 1.1 (voir [`fonts/`](fonts/LISEZ-MOI.md)). La police de titre de campuss.fr,
  Massilia (licence commerciale), n'est pas incluse : Source Sans 3 la remplace au même emplacement.
- Icônes Hugeicons (édition gratuite, MIT) ; bibliothèques listées dans `package.json` et sur la page `/credits`.
- Le modèle 3D du téléphone de la page de présentation (licence Sketchfab Standard) n'est pas inclus : la page affiche
  son repli statique.
