# Captures de la page de présentation

Les images de `public/presentation/` (et `public/og.png`) sont de vraies captures de l'interface, prises sur un
**jeu de démonstration fictif** (`scripts/seed-demo.ts` : six étudiants inventés, neuf cours de L1 d'économie,
fiches, partiels, amis). Jamais de capture de production. À refaire après tout changement visible des écrans montrés.

La page lit `public/presentation/manifest.json` : une capture absente fait disparaître ce qui la montre
(case du bento, démonstration de Campuss IA, onglet d’appareil, écran du téléphone 3D ou du récit).

## Régénérer (environnement jetable, environ 15 minutes)

```sh
# À la racine du dépôt, après npm ci (node_modules installé par node:22-alpine)
L=vitrine; N=$L-essai; NM=$PWD/node_modules; RAW=$(mktemp -d)
docker network create $N
docker run -d --name $L-pg --network $N -m 384m -e POSTGRES_USER=campus -e POSTGRES_PASSWORD=essai -e POSTGRES_DB=campus postgres:17-alpine
docker run -d --name $L-minio --network $N -m 512m -e MINIO_ROOT_USER=essai -e MINIO_ROOT_PASSWORD=essai-minio-12345 -e MINIO_BROWSER=off \
  cgr.dev/chainguard/minio@sha256:0a01100085e30fb08d2f39e39c9f5c9d83a95707f220b007d813b690cd41622d server /data
# AI_API_KEY factice : l'interface de Campuss IA s'affiche, aucun appel ne part pendant les captures
docker run -d --name $L-web --network $N -m 2500m -v $PWD:/app -v $NM:/app/node_modules -w /app \
  -e DATABASE_URL=postgresql://campus:essai@$L-pg:5432/campus -e SECRET_KEY=essai-cle-secrete-de-trente-deux-caracteres \
  -e BASE_URL=http://localhost:3000 -e S3_ENDPOINT=http://$L-minio:9000 -e S3_ACCESS_KEY=essai -e S3_SECRET_KEY=essai-minio-12345 \
  -e ADMIN_EMAIL=admin@essai.local -e ADMIN_PASSWORD_FILE=/tmp/admin.txt -e AI_API_KEY=demo-sans-appel \
  node:22-alpine sh -c 'echo phrase-longue-pour-essai-22 > /tmp/admin.txt; node scripts/build-vendor.mjs >/dev/null 2>&1; npx next dev -H 0.0.0.0 -p 3000'
# Attendre « démarré » dans docker logs $L-web (migrations de drizzle/ appliquées).

docker run --rm --network $N -v $PWD:/app -v $NM:/app/node_modules -w /app -e DEMO_SEED=1 \
  -e DATABASE_URL=postgresql://campus:essai@$L-pg:5432/campus node:22-alpine npx tsx scripts/seed-demo.ts

# Captures : téléphone 393×852 en 3x (iPhone 15/16, zone sûre émulée : 59 pt en haut, 34 en bas, barre d'état
# et indicateur d'accueil dessinés dans la marge, barre d'onglets entière), 820×1180 et 1280×800 en 2x ;
# clair et sombre, mouvement réduit. Livrées en 1x et 2x (AVIF + WebP).
PW=$(mktemp -d); cp scripts/capture-showcase.mjs $PW/
docker run --rm --network container:$L-web -m 1500m -v $PW:/pw -v $RAW:/raw -w /pw -e RAW_DIR=/raw \
  mcr.microsoft.com/playwright:v1.56.0-noble sh -c 'npm init -y >/dev/null; npm i playwright@1.56.0 >/dev/null 2>&1; node capture-showcase.mjs shoot'
#   ONLY=case-annote,ia-quiz pour ne refaire que certaines captures.

# Encodage : AVIF + WebP en 1x et 2x, manifest.json, et public/og.png (1200×630)
docker run --rm -v $PWD:/app -v $NM:/app/node_modules -v $RAW:/raw -w /app -e RAW_DIR=/raw node:22-alpine node scripts/capture-showcase.mjs encode

# Nettoyage
docker rm -f $L-web $L-pg $L-minio; docker network rm $N; rm -rf $RAW $PW
```

Les captures du téléphone servent telles quelles au téléphone dessiné (`IPhoneFrame`, écran aux mêmes proportions,
rien de recadré) et à l'écran du modèle 3D (`phone-3d.ts`, qui prend le WebP 2x). Ne pas y ajouter de barre d'état
côté page : elle est déjà dans l'image.

Le seed refuse de tourner sans `DEMO_SEED=1` ou sur une base qui a déjà des comptes autres que l'administrateur.
