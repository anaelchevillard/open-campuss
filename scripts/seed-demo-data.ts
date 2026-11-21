/**
 * Contenu du jeu de démonstration (scripts/seed-demo.ts) : une licence d'économie et gestion fictive, de L1 à L3.
 * Enseignants, sujets et corrigés sont inventés ; les notions sont celles d'un premier cycle d'économie.
 */
import type { Category } from "../src/lib/db/schema";

/** [nom, nom court, semestre absolu (L1 S1 = 1 … L3 S6 = 6)] */
export const SUBJECTS: [string, string, number][] = [
  ["Microéconomie", "Micro", 1], ["Statistiques", "Stats", 1], ["Mathématiques", "Maths", 1], ["Histoire des faits économiques", "Histoire", 1],
  ["Macroéconomie", "Macro", 2], ["Comptabilité générale", "Compta", 2], ["Probabilités", "Probas", 2],
  ["Concurrence imparfaite", "Micro 2", 3], ["Économétrie", "Économétrie", 3],
  ["Économie monétaire", "Monnaie", 4], ["Finance d’entreprise", "Finance", 4],
  ["Économie internationale", "International", 5], ["Économie publique", "Éco publique", 5],
  ["Politiques économiques", "Politiques", 6], ["Économie de l’environnement", "Environnement", 6],
];

export type DemoCourse = {
  key: string; subject: number; title: string; category: Category; chapter: number; author: number; ago: number; body: string;
  teacher?: string; yearsBack?: number; draft?: boolean;
};

export const COURSES: DemoCourse[] = [
  // L1, semestre 1
  { key: "offre-demande", subject: 0, title: "L’offre, la demande et l’équilibre du marché", category: "cours", chapter: 2, author: 1, teacher: "M. Perrin", ago: 2, body: `## Ce qu’il faut retenir

Sur un marché concurrentiel, le **prix d’équilibre** est celui pour lequel la quantité demandée égale la quantité offerte. Au-dessus, il y a un excédent d’offre ; en dessous, une pénurie.

## 1. La demande

La fonction de demande relie le prix d’un bien à la quantité que les consommateurs souhaitent acheter. Elle est en général **décroissante** : quand le prix monte, on achète moins.

- Effet de substitution : le bien devient relativement plus cher que ses substituts.
- Effet revenu : à revenu donné, le pouvoir d’achat baisse.

## 2. L’offre

La fonction d’offre est **croissante** : un prix plus élevé rend la production rentable pour davantage d’entreprises.

## 3. L’élasticité-prix

L’élasticité mesure la sensibilité de la demande au prix : $e = \\frac{\\Delta Q / Q}{\\Delta P / P}$. Une demande est dite élastique quand $|e| > 1$.

## 4. Déplacements de l’équilibre

Une hausse du revenu déplace la courbe de demande vers la droite : le prix et la quantité d’équilibre augmentent tous les deux.` },
  { key: "fiche-elasticites", subject: 0, title: "Fiche : les élasticités en une page", category: "fiche", chapter: 2, author: 0, ago: 5, body: `## Élasticité-prix

$e = \\frac{\\Delta Q / Q}{\\Delta P / P}$. Élastique si $|e| > 1$, rigide si $|e| < 1$.

## Élasticité-revenu

Positive pour un bien normal, négative pour un bien inférieur, supérieure à 1 pour un bien de luxe.

## Élasticité croisée

Positive entre substituts (thé, café), négative entre compléments (imprimante, cartouches).` },
  { key: "td-micro-consommateur", subject: 0, title: "TD 4 corrigé : le choix du consommateur", category: "td", chapter: 3, author: 2, teacher: "M. Perrin", ago: 8, body: `## Exercice 1

Un étudiant dispose de 60 € par semaine pour des cafés (2 €) et des sandwichs (5 €). Écrire sa contrainte budgétaire.

**Corrigé** : $2C + 5S = 60$. Si $S = 0$, il peut acheter 30 cafés ; si $C = 0$, 12 sandwichs.

## Exercice 2

À l’optimum, le taux marginal de substitution égale le rapport des prix : $TMS = \\frac{P_C}{P_S} = 0{,}4$.` },
  { key: "annale-micro", subject: 0, title: "Partiel de microéconomie, sujet et corrigé", category: "partiel", chapter: 0, author: 1, teacher: "M. Perrin", ago: 30, yearsBack: 1, body: `## Question de cours (6 points)

Définissez l’élasticité-prix de la demande et donnez un exemple de bien à demande rigide.

**Éléments de corrigé** : variation relative de la quantité rapportée à la variation relative du prix ; carburant, tabac, médicaments.

## Exercice (14 points)

Demande $Q_d = 100 - 2P$, offre $Q_o = 3P - 20$. Calculez l’équilibre.

**Corrigé** : $100 - 2P = 3P - 20$, donc $P^* = 24$ et $Q^* = 52$.` },
  { key: "stats-descriptive", subject: 1, title: "Statistique descriptive : moyenne, médiane, écart-type", category: "cours", chapter: 1, author: 2, teacher: "Mme Caron", ago: 4, body: `## Les indicateurs de position

La **moyenne** résume une série par une seule valeur, mais elle est sensible aux valeurs extrêmes. La **médiane** partage la série en deux moitiés de même effectif.

## Les indicateurs de dispersion

L’**écart-type** mesure la dispersion autour de la moyenne : $\\sigma = \\sqrt{\\frac{1}{n}\\sum (x_i - \\bar{x})^2}$.

## Exemple

Notes d’un TD : 8, 11, 12, 12, 17. Moyenne : 12. Médiane : 12. Écart-type : environ 2,8.` },
  { key: "td-stats-series", subject: 1, title: "TD 3 corrigé : séries statistiques", category: "td", chapter: 1, author: 3, teacher: "Mme Caron", ago: 5, body: `## Exercice 1

Calculer la moyenne et la médiane de la série 4, 7, 7, 9, 13.

**Corrigé** : moyenne 8, médiane 7.

## Exercice 2

Que devient la moyenne si l’on ajoute 2 à chaque valeur ? Et l’écart-type ?

**Corrigé** : la moyenne augmente de 2, l’écart-type ne change pas.` },
  { key: "annale-stats", subject: 1, title: "Partiel de statistiques, sujet et corrigé", category: "partiel", chapter: 0, author: 3, teacher: "Mme Caron", ago: 60, yearsBack: 2, body: `## Exercice 1

Les loyers de dix studios (en €) : 380, 410, 420, 450, 450, 470, 480, 500, 520, 900. Calculez la moyenne et la médiane ; laquelle résume le mieux la série ?

**Corrigé** : moyenne 498 €, médiane 460 €. La médiane, car le loyer de 900 € tire la moyenne vers le haut.` },
  { key: "derivees", subject: 2, title: "Fonctions d’une variable : dérivées et optimisation", category: "cours", chapter: 4, author: 1, teacher: "M. Roche", ago: 11, body: `## Dérivée et sens de variation

Si $f'(x) > 0$ sur un intervalle, $f$ y est croissante.

## Optimisation

Un extremum local d’une fonction dérivable vérifie $f'(x) = 0$. On vérifie ensuite le signe de $f''$ : négatif pour un maximum, positif pour un minimum.

## Application

Le profit $\\pi(q) = -q^2 + 40q - 100$ est maximal en $q = 20$.` },
  { key: "fiche-suites", subject: 2, title: "Fiche : suites arithmétiques et géométriques", category: "fiche", chapter: 2, author: 4, ago: 9, body: `## Arithmétique

$u_{n+1} = u_n + r$, donc $u_n = u_0 + nr$.

## Géométrique

$u_{n+1} = q \\, u_n$, donc $u_n = u_0 \\, q^n$. Un capital placé à 3 % par an suit une suite géométrique de raison 1,03.` },
  { key: "revolution-industrielle", subject: 3, title: "La révolution industrielle en Angleterre", category: "cours", chapter: 3, author: 4, teacher: "Mme Fabre", ago: 9, body: `## Pourquoi l’Angleterre ?

Charbon abondant, révolution agricole, marché intérieur unifié et capitaux disponibles.

## Les secteurs moteurs

Le textile, puis la sidérurgie et le chemin de fer à partir des années 1830.` },
  { key: "brouillon-chronologie", subject: 3, title: "Chronologie de la première industrialisation", category: "fiche", chapter: 3, author: 0, ago: 1, draft: true, body: `## Repères

- 1769 : machine à vapeur de Watt.
- 1830 : première ligne de chemin de fer entre deux grandes villes.

*À compléter avant le partiel.*` },

  // L1, semestre 2
  { key: "pib", subject: 4, title: "Le PIB et ses trois approches", category: "cours", chapter: 1, author: 3, teacher: "M. Lambert", ago: 6, body: `## Définition

Le produit intérieur brut mesure la richesse produite sur un territoire pendant une année.

## Trois approches, un même résultat

1. **Production** : somme des valeurs ajoutées.
2. **Dépenses** : consommation + investissement + dépenses publiques + exportations nettes.
3. **Revenus** : salaires + excédent brut d’exploitation + impôts sur la production.` },
  { key: "fiche-multiplicateur", subject: 4, title: "Fiche : le multiplicateur keynésien", category: "fiche", chapter: 3, author: 2, ago: 7, body: `## L’idée

Une dépense publique supplémentaire devient le revenu de quelqu’un, qui en dépense une partie, et ainsi de suite.

## La formule

$k = \\frac{1}{1 - c}$, où $c$ est la propension marginale à consommer. Avec $c = 0{,}8$, $k = 5$.` },
  { key: "partiel-macro", subject: 4, title: "Partiel de macroéconomie, sujet et corrigé", category: "partiel", chapter: 0, author: 4, teacher: "M. Lambert", ago: 20, yearsBack: 1, body: `## Question 1

Expliquez la différence entre PIB nominal et PIB réel.

**Éléments de corrigé** : le PIB réel est calculé à prix constants, il neutralise l’inflation.` },
  { key: "bilan", subject: 5, title: "Le bilan et le compte de résultat", category: "cours", chapter: 2, author: 5, teacher: "M. Vidal", ago: 13, body: `## Le bilan

Une photographie du patrimoine à une date donnée : l’**actif** (ce que l’entreprise possède) et le **passif** (comment elle le finance).

## Le compte de résultat

Un film de l’année : produits moins charges.` },
  { key: "td-ecritures", subject: 5, title: "TD 2 corrigé : premières écritures", category: "td", chapter: 1, author: 6, teacher: "M. Vidal", ago: 14, body: `## Exercice

Achat de marchandises 1 200 € HT, TVA 20 %, payé par banque.

**Corrigé** : débit 607 Achats 1 200 ; débit 44566 TVA déductible 240 ; crédit 512 Banque 1 440.` },
  { key: "probas-intro", subject: 6, title: "Probabilités : événements et indépendance", category: "cours", chapter: 1, author: 2, teacher: "Mme Caron", ago: 15, body: `## Vocabulaire

Une expérience aléatoire a un ensemble de résultats possibles $\\Omega$. Un événement est une partie de $\\Omega$.

## Indépendance

$A$ et $B$ sont indépendants si $P(A \\cap B) = P(A) \\, P(B)$.` },

  // L2
  { key: "monopole", subject: 7, title: "Le monopole et sa tarification", category: "cours", chapter: 1, author: 5, teacher: "Mme Brun", ago: 10, body: `## L’équilibre du monopole

Le monopole choisit la quantité qui égalise recette marginale et coût marginal : $Rm = Cm$. Le prix est lu sur la courbe de demande, au-dessus du coût marginal.

## La perte sèche

Moins de quantité, un prix plus élevé : une partie du surplus disparaît.` },
  { key: "td-oligopole", subject: 7, title: "TD 3 corrigé : duopole de Cournot", category: "td", chapter: 2, author: 6, teacher: "Mme Brun", ago: 12, body: `## Exercice

Demande $P = 120 - Q$, deux firmes de coût marginal nul.

**Corrigé** : fonctions de réaction $q_1 = 60 - q_2 / 2$ ; équilibre $q_1 = q_2 = 40$, prix 40.` },
  { key: "mco", subject: 8, title: "La régression linéaire et les moindres carrés", category: "cours", chapter: 2, author: 6, teacher: "M. Noël", ago: 8, body: `## Le modèle

$y_i = \\beta_0 + \\beta_1 x_i + \\varepsilon_i$.

## L’estimateur des MCO

Il minimise la somme des carrés des résidus. La pente vaut $\\hat\\beta_1 = \\frac{\\text{Cov}(x, y)}{\\text{Var}(x)}$.

## Le R²

Part de la variance de $y$ expliquée par le modèle, entre 0 et 1.` },
  { key: "fiche-econometrie", subject: 8, title: "Fiche : lire une sortie de régression", category: "fiche", chapter: 2, author: 5, ago: 6, body: `## Ce qu’on regarde

1. Le signe et la taille des coefficients.
2. La statistique $t$ : significatif à 5 % si $|t| > 1{,}96$.
3. Le R² ajusté pour comparer des modèles.` },
  { key: "annale-econometrie", subject: 8, title: "Partiel d’économétrie, sujet et corrigé", category: "partiel", chapter: 0, author: 6, teacher: "M. Noël", ago: 40, yearsBack: 1, body: `## Exercice

Une régression du salaire sur les années d’études donne $\\hat\\beta_1 = 0{,}08$ avec $t = 5{,}2$. Interprétez.

**Corrigé** : une année d’études de plus est associée à un salaire environ 8 % plus élevé ; le coefficient est significatif.` },
  { key: "creation-monetaire", subject: 9, title: "La création monétaire par les banques", category: "cours", chapter: 1, author: 6, teacher: "M. Faure", ago: 16, body: `## Les crédits font les dépôts

Quand une banque accorde un crédit, elle crée un dépôt du même montant : la monnaie est créée *ex nihilo*.

## Les limites

Besoins de refinancement auprès de la banque centrale, réserves obligatoires, demande de crédit.` },
  { key: "van", subject: 10, title: "Choisir un investissement : la VAN", category: "cours", chapter: 2, author: 5, teacher: "Mme Simon", ago: 18, body: `## Actualiser

Un euro demain vaut moins qu’un euro aujourd’hui : $\\frac{F}{(1 + r)^t}$.

## La valeur actuelle nette

$VAN = -I_0 + \\sum \\frac{F_t}{(1 + r)^t}$. On retient un projet si sa VAN est positive.` },
  { key: "td-finance", subject: 10, title: "TD 1 corrigé : actualisation", category: "td", chapter: 1, author: 5, teacher: "Mme Simon", ago: 19, body: `## Exercice

Que vaut aujourd’hui 1 100 € reçus dans un an, au taux de 10 % ?

**Corrigé** : $1\\,100 / 1{,}1 = 1\\,000$ €.` },

  // L3
  { key: "ricardo", subject: 11, title: "Avantages comparatifs : le modèle de Ricardo", category: "cours", chapter: 1, author: 7, teacher: "M. Garcia", ago: 17, body: `## L’idée

Chaque pays gagne à se spécialiser dans le bien où il a un **avantage comparatif**, même s’il est moins productif partout.

## L’exemple du drap et du vin

Le Portugal est plus productif pour les deux biens, mais relativement plus pour le vin : il exporte du vin, l’Angleterre du drap.` },
  { key: "biens-publics", subject: 12, title: "Les biens publics et le passager clandestin", category: "cours", chapter: 2, author: 8, teacher: "Mme Petit", ago: 21, body: `## Définition

Un bien public pur est **non rival** et **non excluable** : l’éclairage public, la défense nationale.

## Le passager clandestin

Chacun a intérêt à profiter du bien sans payer : le marché le produit en quantité insuffisante.` },
  { key: "fiche-politique-budgetaire", subject: 13, title: "Fiche : politique budgétaire et monétaire", category: "fiche", chapter: 1, author: 8, ago: 22, body: `## Politique budgétaire

Dépenses publiques et impôts. Relance par le déficit ; effet d’éviction possible.

## Politique monétaire

Taux directeurs de la banque centrale. Objectif principal : la stabilité des prix.` },
  { key: "externalites", subject: 14, title: "Externalités et taxe pigouvienne", category: "cours", chapter: 1, author: 7, teacher: "Mme Laurent", ago: 24, body: `## L’externalité

Une pollution impose un coût à des tiers que le pollueur ne paie pas : le coût social dépasse le coût privé.

## La taxe pigouvienne

Une taxe égale au dommage marginal fait payer ce coût et ramène la production à l’optimum.` },
  { key: "annale-environnement", subject: 14, title: "Partiel d’économie de l’environnement, sujet et corrigé", category: "partiel", chapter: 0, author: 8, teacher: "Mme Laurent", ago: 50, yearsBack: 1, body: `## Dissertation

Taxe carbone ou marché de quotas : quels avantages respectifs ?

**Éléments de corrigé** : la taxe fixe le prix et laisse la quantité incertaine ; les quotas fixent la quantité et laissent le prix varier.` },
];

type Question = { question: string; choices: string[]; answer: number; explanation: string };

export const QUIZZES: Record<string, Question[]> = {
  "offre-demande": [
    { question: "Une hausse du revenu des consommateurs, pour un bien normal…", choices: ["déplace la demande vers la gauche", "déplace la demande vers la droite", "déplace l’offre vers la droite", "ne change pas l’équilibre"], answer: 1, explanation: "Le bien normal est davantage demandé quand le revenu augmente." },
    { question: "Une demande est élastique quand…", choices: ["|e| < 1", "|e| = 0", "|e| > 1", "e est positive"], answer: 2, explanation: "La quantité varie proportionnellement plus que le prix." },
    { question: "Au-dessus du prix d’équilibre, on observe…", choices: ["une pénurie", "un excédent d’offre", "une hausse de la demande", "l’équilibre"], answer: 1, explanation: "Les vendeurs offrent plus que ce que les acheteurs demandent." },
    { question: "La courbe d’offre est en général…", choices: ["décroissante", "verticale", "croissante", "horizontale"], answer: 2, explanation: "Un prix plus élevé rend la production rentable pour davantage d’entreprises." },
  ],
  "stats-descriptive": [
    { question: "Quel indicateur est le moins sensible aux valeurs extrêmes ?", choices: ["la moyenne", "la médiane", "l’écart-type", "l’étendue"], answer: 1, explanation: "La médiane ne dépend que du rang des valeurs." },
    { question: "Si l’on ajoute 2 à toutes les valeurs, l’écart-type…", choices: ["augmente de 2", "double", "ne change pas", "diminue"], answer: 2, explanation: "La dispersion autour de la moyenne reste la même." },
    { question: "La médiane de 3, 5, 9, 10, 20 est…", choices: ["9", "9,4", "5", "10"], answer: 0, explanation: "C’est la valeur du milieu de la série ordonnée." },
  ],
  pib: [
    { question: "L’approche par la production additionne…", choices: ["les chiffres d’affaires", "les valeurs ajoutées", "les salaires", "les exportations"], answer: 1, explanation: "Additionner les chiffres d’affaires compterait plusieurs fois les consommations intermédiaires." },
    { question: "Le PIB réel est calculé…", choices: ["à prix courants", "à prix constants", "en dollars", "hors services"], answer: 1, explanation: "Les prix constants neutralisent l’inflation." },
  ],
  mco: [
    { question: "L’estimateur des MCO minimise…", choices: ["la somme des résidus", "la somme des carrés des résidus", "le R²", "la variance de x"], answer: 1, explanation: "Les écarts positifs et négatifs ne se compensent pas une fois élevés au carré." },
    { question: "Un R² de 0,9 signifie que…", choices: ["90 % de la variance de y est expliquée", "le coefficient vaut 0,9", "le modèle est causal", "90 % des points sont sur la droite"], answer: 0, explanation: "Le R² mesure la part de variance expliquée, pas la causalité." },
  ],
  ricardo: [
    { question: "Selon Ricardo, un pays se spécialise dans le bien où il a…", choices: ["un avantage absolu", "un avantage comparatif", "le plus de capital", "le plus de main-d’œuvre"], answer: 1, explanation: "Même moins productif partout, un pays gagne à se spécialiser là où son désavantage est le plus faible." },
  ],
};

type Card = { front: string; back: string };

export const DECKS: Record<string, Card[]> = {
  "offre-demande": [
    { front: "Quand dit-on qu’une demande est élastique ?", back: "Quand la valeur absolue de l’élasticité-prix dépasse 1 : la quantité varie plus que le prix." },
    { front: "Qu’est-ce que le prix d’équilibre ?", back: "Le prix pour lequel la quantité demandée égale la quantité offerte." },
    { front: "Effet de substitution", back: "Le bien devient relativement plus cher que ses substituts : on se reporte sur eux." },
    { front: "Effet d’une hausse du revenu (bien normal)", back: "La demande se déplace vers la droite : prix et quantité d’équilibre augmentent." },
  ],
  "stats-descriptive": [
    { front: "Médiane", back: "La valeur qui partage la série en deux moitiés de même effectif." },
    { front: "Écart-type", back: "La racine de la moyenne des carrés des écarts à la moyenne." },
    { front: "Moyenne ou médiane avec une valeur extrême ?", back: "La médiane : elle n’est pas tirée par les valeurs extrêmes." },
    { front: "Ajouter une constante à toutes les valeurs", back: "La moyenne augmente d’autant ; l’écart-type ne change pas." },
  ],
  pib: [
    { front: "Les trois approches du PIB", back: "Production (valeurs ajoutées), dépenses, revenus." },
    { front: "PIB réel", back: "PIB calculé à prix constants : il neutralise l’inflation." },
    { front: "Exportations nettes", back: "Exportations moins importations ; elles peuvent être négatives." },
  ],
  bilan: [
    { front: "Actif du bilan", back: "Ce que l’entreprise possède : immobilisations, stocks, créances, trésorerie." },
    { front: "Passif du bilan", back: "Comment l’actif est financé : capitaux propres et dettes." },
    { front: "Compte de résultat", back: "Produits moins charges sur l’exercice : le résultat." },
  ],
  derivees: [
    { front: "Condition du premier ordre", back: "Un extremum local d’une fonction dérivable vérifie f′(x) = 0." },
    { front: "Maximum ou minimum ?", back: "f″ < 0 : maximum ; f″ > 0 : minimum." },
  ],
  mco: [
    { front: "Pente estimée par les MCO", back: "Cov(x, y) / Var(x)." },
    { front: "Coefficient significatif à 5 %", back: "Quand la statistique t dépasse 1,96 en valeur absolue." },
  ],
};
