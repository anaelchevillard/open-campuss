# Héberger Campuss

Ce guide installe une instance de production : Campuss, PostgreSQL et MinIO avec Docker Compose, derrière un proxy
HTTPS. Compter 2 Go de mémoire (4 Go avec l'antivirus) et quelques Go de disque pour les fichiers déposés.

## 1. Installer

Sur un serveur Linux avec Docker et Docker Compose v2, et Node.js 22 pour la préparation :

```sh
git clone <adresse de ce dépôt> campuss && cd campuss
npm run setup            # adresse publique (https://campuss.example.org) et mail de l'administrateur
docker compose up -d
npm run admin:password   # mot de passe provisoire, à changer à la première connexion
```

Sans Node.js sur le serveur : `cp .env.example .env`, puis remplir les variables de la section « Obligatoire »
(`openssl rand -base64 48` pour `SECRET_KEY`, `openssl rand -hex 24` pour les mots de passe).

L'application écoute sur `127.0.0.1:3000` (`CAMPUS_PORT`) : seul le proxy, sur la même machine, la joint. La base et
MinIO sont sur un réseau Docker interne, sans port publié.

À régler ensuite dans `.env`, puis `docker compose up -d` (jamais `restart`, qui garde l'ancien environnement) :

- `SMTP_*` pour les mails (inscription, mot de passe oublié, notifications) ;
- `AUTO_APPROVE_DOMAINS` pour les domaines étudiants admis sans relecture, et `ORGANIZATION_*`, `UNIVERSITY_NAME` pour
  les textes de la présentation ;
- `CONTENT_ORIGIN` : un second domaine (ex. `https://contenu.campuss.example.org`) qui sert les contenus déposés
  (artefacts HTML), isolés du site. Il pointe vers le même service.

## 2. Proxy HTTPS

HTTPS est obligatoire : les cookies de session sont `Secure` et préfixés `__Host-`. Le proxy doit transmettre les
WebSockets (temps réel sur `/collab`) et accepter des envois de 8 Mo par requête.

**Caddy** (certificats automatiques), `/etc/caddy/Caddyfile` :

```caddyfile
campuss.example.org, contenu.campuss.example.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

**Traefik** (configuration dynamique en fichier, Campuss joint par l'hôte) :

```yaml
http:
  routers:
    campuss:
      rule: Host(`campuss.example.org`) || Host(`contenu.campuss.example.org`)
      entryPoints: [websecure]
      tls: { certResolver: letsencrypt }
      service: campuss
  services:
    campuss:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:3000" }]
```

Derrière Cloudflare uniquement (le serveur n'accepte que les adresses de Cloudflare), `TRUSTED_IP_HEADER=cf-connecting-ip`
donne la vraie adresse des visiteurs aux limites de débit. Ne jamais l'activer si le serveur est joignable directement :
l'en-tête serait falsifiable.

## 3. Sauvegarder

Deux choses à sauvegarder : la base et les fichiers de MinIO. `.env` contient les secrets : à garder à part, hors du
serveur.

```sh
# Base : dump compressé, restaurable par pg_restore
docker compose exec -T db pg_dump -U campus -d campus -Fc > campuss-$(date +%F).dump

# Fichiers : archive du volume MinIO (nom du volume : docker volume ls)
docker run --rm -v campuss_minio:/data:ro -v "$PWD":/backup alpine tar czf /backup/minio-$(date +%F).tar.gz -C /data .
```

Automatiser chaque nuit (cron ou timer systemd), copier hors du serveur (restic, rclone…) et **tester la restauration**
sur une machine jetable. Restaurer la base, service arrêté :

```sh
docker compose stop web
docker compose exec -T db pg_restore -U campus -d campus --clean --if-exists < campuss-AAAA-MM-JJ.dump
docker compose start web
```

`BACKUP_STATUS_FILE` affiche l'état de votre dernière sauvegarde dans Administration › Système.

## 4. Mettre à jour

```sh
git pull
docker compose up -d --build
```

Les migrations de `drizzle/` s'appliquent au démarrage. Sauvegarder la base avant chaque mise à jour. La version
déployée (commit) s'affiche dans Administration › Système si l'image est construite avec
`GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build`.

## 5. Options

- **Antivirus** : `CLAMAV_HOST=clamav` dans `.env`, puis `docker compose --profile antivirus up -d` (environ 1,2 Go de
  mémoire). Un fichier déposé reste inaccessible tant que l'analyse n'a pas répondu.
- **Stockage S3 distant** (Cloudflare R2, Scaleway…) à la place de MinIO : `compose.override.yaml` à côté de
  `compose.yaml`, puis `docker compose up -d` :

  ```yaml
  services:
    web:
      environment:
        S3_ENDPOINT: https://<compte>.r2.cloudflarestorage.com
        S3_REGION: auto
        S3_BUCKET: campuss
        S3_ACCESS_KEY: <clé>
        S3_SECRET_KEY: <secret>
  ```

- **Notifications push** : `npx web-push generate-vapid-keys`, puis `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`. Changer de
  clés coupe tous les abonnements.
- **Campuss IA** : `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (toute API compatible OpenAI). Vérifiez que l'offre choisie
  ne réutilise pas les contenus envoyés, et adaptez la politique de confidentialité.
- **Fichiers publics** : ce qui est déposé dans le volume `partage` est servi tel quel à `/content/<chemin>`.

## 6. Avant d'ouvrir l'instance

- Relire les pages légales (`/cgu`, `/confidentialite`, `/credits`) : elles décrivent campuss.fr et doivent être adaptées
  à votre instance (éditeur, hébergement, durées de conservation, prestataires).
- Choisir le mode d'inscription dans Administration › Réglages (ouverte, sur invitation, fermée).
- Activer la double authentification du compte administrateur (obligatoire pour les administrateurs).
