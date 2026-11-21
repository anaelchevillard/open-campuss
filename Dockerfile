FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build
# L'image tourne sur Alpine (musl) : les binaires de sharp pour glibc et sa version WebAssembly de secours n'y servent
# jamais (≈ 27 Mo). On vérifie ensuite que sharp se charge encore, depuis le dossier livré.
RUN rm -rf .next/standalone/node_modules/@img/sharp-linux-* .next/standalone/node_modules/@img/sharp-libvips-linux-* .next/standalone/node_modules/@img/sharp-wasm32 \
  && cd .next/standalone && node -e "console.log('sharp chargé, libvips', require('sharp').versions.vips)"

FROM node:22-alpine AS run
WORKDIR /app
# Version affichée dans Admin › Système et datant les erreurs : GIT_SHA=$(git rev-parse --short HEAD)
# docker compose build. Posée dans la dernière étape seulement : elle ne casse pas le cache du build
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 CAMPUS_TMP=/work
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/collab.mjs ./collab.mjs
# Rendu TikZ : le fil de rendu empaqueté et les fichiers du moteur TeX
COPY --from=build /app/tikz-worker.mjs ./tikz-worker.mjs
COPY --from=build /app/tikz ./tikz
# Jeu de démonstration empaqueté (npm run demo:seed) : refuse toute base qui contient déjà des comptes
COPY --from=build /app/seed-demo.mjs ./seed-demo.mjs
# Points de montage : un volume Docker neuf hérite de ce propriétaire (l'application tourne sous node)
RUN mkdir -p /secrets /work /partage && chown node:node /secrets /work
# Le serveur n'a besoin que de node : npm, npx et corepack (et leurs dépendances aux CVE connues) ne restent pas dans l'image
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
USER node
CMD ["node", "--import", "./collab.mjs", "server.js"]
