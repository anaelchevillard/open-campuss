# Sécurité

## Signaler une vulnérabilité

Ne publiez pas de faille dans un ticket public. Signalez-la en privé :

- par le signalement privé de GitHub (onglet **Security** › **Report a vulnerability**) ;
- ou par le formulaire https://campuss.fr/contact, en commençant le message par « Sécurité ».

Le contact est aussi publié dans https://campuss.fr/.well-known/security.txt.

Décrivez la faille, les étapes pour la reproduire et son impact. Nous accusons réception sous 7 jours et vous tenons
informé jusqu'au correctif. Merci de nous laisser le temps de corriger avant toute publication.

## Périmètre

- Le code de ce dépôt et le service https://campuss.fr, y compris l'instance de démonstration.
- Hors périmètre : déni de service volumétrique, ingénierie sociale, attaques physiques, instances hébergées par des tiers.

N'accédez pas aux données d'autres personnes : utilisez vos propres comptes de test ou une instance locale
(`npm run setup`, puis `docker compose up -d`).

## Versions prises en charge

Seule la dernière version de la branche `main` reçoit des correctifs.
