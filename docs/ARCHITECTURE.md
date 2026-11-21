# Architecture

Campuss est une application Next.js 16 (App Router) rendue côté serveur, avec PostgreSQL et un stockage S3. Un seul
processus Node sert les pages, les routes d'API, les actions serveur et le temps réel.

## Dossiers

| Dossier | Contenu |
| --- | --- |
| `src/app/` | Une route par dossier. Pages serveur, `actions/` (actions serveur, toutes les écritures), `api/` (envois de fichiers, recherche, mesure, santé, notifications…). |
| `src/components/` | Composants React par espace (`revise/`, `editor/`, `admin/`…). `ui/` : shadcn/ui ; `reui/` : ReUI. |
| `src/lib/` | Logique métier. Les fichiers `*-rules.ts` et les modules sans base sont purs et testés directement. |
| `src/lib/db/schema/` | Tables Drizzle, un fichier par domaine (`core.ts`, `reviser.ts`, `admin.ts`…). |
| `src/lib/ai/` | Client de l'API d'IA, consignes, validation des réponses (zod), budget quotidien. |
| `src/lib/mail/` | Gabarits des mails, file d'envoi et regroupement des mails non urgents. |
| `src/collab/` | Serveur Hocuspocus (Yjs), empaqueté en `collab.mjs` et chargé en tête du serveur Next. |
| `src/rich-worker/` | Rendu des figures TikZ en SVG, dans un fil d'exécution à part. |
| `src/proxy.ts` | Chaque requête : CSP à nonce, en-têtes de sécurité, origine des contenus. |
| `drizzle/` | Migrations SQL, appliquées au démarrage (`src/lib/boot.ts`). |
| `scripts/` | `setup.mjs`, scripts de build, jeu de démonstration (`seed-demo.ts`). |
| `tests/` | Vitest (`*.test.ts`) ; `e2e.mjs` et `e2e-parts/` : parcours Playwright sur une pile jetable. |

## Flux

- **Démarrage** (`src/instrumentation.ts`, `src/lib/boot.ts`) : migrations, premier administrateur, puis une tâche de
  fond toutes les 10 secondes : file des mails, analyses de fichiers, quiz, rappels, nettoyage et durées de conservation.
- **Lecture** : une page serveur vérifie la session et l'accès par la règle unique de `src/lib/access.ts` (licence,
  rôle, statut du cours), puis lit la base avec Drizzle. Les pages privées ne sont jamais mises en cache partagé.
- **Écriture** : une action serveur valide l'entrée (zod), revérifie l'accès, écrit, puis journalise ce qui touche à
  la modération et à l'administration.
- **Fichiers** : envoyés par morceaux de 8 Mo, rangés dans MinIO, analysés par ClamAV s'il est configuré, servis par
  l'application après contrôle d'accès (jamais d'adresse MinIO donnée au navigateur). Les contenus HTML déposés
  (artefacts) sont servis par `CONTENT_ORIGIN`, dans un bac à sable.
- **Temps réel** : `/collab` (WebSocket) annonce les changements des notes partagées entre amis ; l'accès est relu en
  base à la connexion puis chaque minute. Tout est enregistré en base, le temps réel n'est qu'un signal.
- **Campuss IA** : appels côté serveur seulement, sans identité de l'étudiant ; réponses validées par schéma, résultat
  enregistré une fois pour tous (quiz, fiches) ; plafond quotidien de jetons.

## Sécurité

- Sessions : cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax` ; seule l'empreinte du jeton est en base.
  Mots de passe en Argon2id ; second facteur TOTP ou clé d'accès, redemandé pour les actions sensibles des
  administrateurs.
- Requêtes : origine contrôlée sur chaque écriture (CSRF), limites de débit par adresse et par compte, Drizzle
  paramétré partout.
- Contenus : Markdown normalisé à l'enregistrement, rendu sans HTML brut ; images et médias limités au site ;
  fichiers piégés téléchargés en binaire ; SVG nettoyés ; imports protégés contre la traversée de chemin, les bombes
  ZIP et les requêtes vers des hôtes internes.
- Conteneur : utilisateur non root, disque en lecture seule, capacités retirées ; base et MinIO sur un réseau interne ;
  l'application n'a accès qu'à son bucket.

Les choix d'interface (tokens, composants, mouvement, accessibilité) sont décrits dans [`DESIGN.md`](../DESIGN.md).
