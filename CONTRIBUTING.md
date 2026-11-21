# Contribuer à Campuss

Merci de votre intérêt. Pour un changement important, ouvrez d'abord un ticket pour en discuter.

## Prérequis

Node.js 22 et npm, Docker avec Docker Compose v2.

```sh
npm ci
npm run setup                               # .env avec des secrets aléatoires
docker compose -f compose.dev.yaml up -d    # base, stockage, mailpit
npm run dev                                 # http://localhost:3000
```

## Avant d'envoyer

Toutes ces commandes doivent passer ; la CI les relance et construit l'image Docker.

```sh
npm run lint
npm run typecheck
npm test
```

- **Tests** : tout correctif ou nouvelle fonction vient avec un test dans `tests/` (Vitest), écrit avec des données fictives.
- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/fr/), en français : `feat: …`, `fix: …`,
  `docs: …`, `test: …`, `refactor: …`, `chore: …`.
- **Une branche par sujet**, une pull request courte et ciblée.
- **Interface** : la charte de [`DESIGN.md`](DESIGN.md) (tokens, composants shadcn/ui et ReUI, icônes par
  `src/lib/icons.ts`), textes en français, accessibilité (contraste, clavier, mouvement réduit).
- **Sécurité** : jamais de `.env`, de clé ni de donnée réelle dans un commit. Aucune vérification côté serveur ne doit
  être affaiblie. Une faille se signale en privé (voir [`SECURITY.md`](SECURITY.md)).

En contribuant, vous acceptez la publication de votre contribution sous la licence du projet (AGPL-3.0-or-later) et le
[code de conduite](CODE_OF_CONDUCT.md).
