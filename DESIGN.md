# Charte de Campuss

Guide de design du projet : principes, tokens, composants, mouvement et accessibilité. Toute nouvelle interface le suit. Démonstration vivante dans l'application : `/admin/charte` (tokens et composants rendus).

Sources : *Refactoring UI* (RUI), *Practical UI* (PUI). Composants : shadcn/ui (style base-nova, Base UI) dans `src/components/ui`, ReUI dans `src/components/reui` (registre `@reui`). Icônes : Hugeicons, par la table unique `src/lib/icons.ts`.

---

## 0. Principes

La sobriété partout, pour que deux choses ressortent : **l'action principale (bordeaux)** et **l'IA (dégradé)**. La personnalité vient de la justesse (espacement, mouvement, détails), jamais d'un décor.

| # | Règle | Source |
|---|---|---|
| 1 | Un seul bouton plein par écran. Secondaire `outline`, tertiaire `ghost` ou lien. Le rare va dans « … ». | PUI « Use a single primary button » ; RUI « Not every button needs a background » |
| 2 | Atténuer avant d'accentuer : on éclaircit ce qui concurrence au lieu de grossir le titre. | RUI « Emphasize by de-emphasizing » |
| 3 | Hiérarchie par le poids et la couleur avant la taille. | RUI « Size isn't everything » |
| 4 | Pas d'étiquette quand la donnée parle : « 12 fiches », pas « Fiches : 12 ». | RUI « Labels are a last resort » |
| 5 | Plus d'espace entre les groupes qu'à l'intérieur. Partir de trop d'espace. | PUI « Group related elements » ; RUI « Start with too much white space » |
| 6 | Moins de bordures : ombre, fond différent ou espace d'abord. | RUI « Use fewer borders » |
| 7 | Jamais la couleur seule : couleur + icône + mot. | PUI « Don't rely on colour alone » |
| 8 | Pas de texte gris sur fond coloré : une teinte de la même couleur. | RUI « Don't use grey text on colored backgrounds » |
| 9 | Ligne de lecture de 45 à 80 caractères, texte long à 18 px, interligne ≥ 1,5. | PUI « Ensure ideal line length », « Make long body text bigger » ; RUI « Keep your line length in check » |
| 10 | Deux graisses : 400 et 600 (700 pour l'affichage public). | PUI « Use regular and bold font weights only » |
| 11 | Les états vides proposent l'action suivante. | RUI « Don't overlook empty states » |
| 12 | Annuler vaut mieux que confirmer. La friction est réservée à ce qui détruit beaucoup. | PUI « Allow people to undo destructive actions », « Add friction to destructive actions » |
| 13 | Pas de bouton désactivé sans explication : le bouton reste actif et dit ce qui manque. | PUI « Try to avoid disabled buttons » |
| 14 | Contraste : 4,5:1 pour le texte, 3:1 pour les bordures de champ et les icônes porteuses de sens. | PUI « Ensure form field borders are high contrast » ; WCAG 1.4.3, 1.4.11 |
| 15 | Une action se fait sur place et s'enregistre seule. Pas de formulaire avant d'écrire, pas de « Valider » en plus. | Usage |
| 16 | Composant shadcn ou ReUI d'abord, CSS maison en dernier. Avant d'écrire du CSS, chercher sur reui.io. | RUI « Supercharge the defaults » |
| 17 | On ne décrit pas l'évident à l'utilisateur. | PUI « Remove unnecessary information », « Be concise » |

---

## 1. Garder, jeter, changer

| | Quoi |
|---|---|
| Garder | Bordeaux `#A10E2F`, logo, Massilia (titres, avec retenue), Source Sans 3 (texte), gris chauds, `--brand-tint`/`--brand-text`, l'effet carte des cours (`DocCard`), l'écriture sur la page finale avec enregistrement automatique et un seul bouton d'envoi, les annotations sans mode, les modes Lecture / Édition / Administration déduits de l'URL, tout parcours en moins de 2 clics, l'auto-hébergement sans pisteur. |
| Jeter | Supercons et la bidouille `svg[viewBox="0 0 32 32"] { scale: 1.25 }` ; `.line-link`, `.chip`, `.table-cards`, `.panel` (remplacés par `Item`, `ToggleGroup`, `DataGrid`, `Card`) ; `--ok` (doublon de `--success`) ; graisses 500/650/700 dans le texte ; `overflow-wrap:anywhere` ; le remplacement global de Source Sans 3 par OpenDyslexic ; la règle de mouvement réduit à 0,01 ms ; le tour `driver.js` ; le burger sur téléphone ; les icônes décoratives dans des tuiles quand une capture ou un mot suffit. |
| Changer | Bordure des champs (1,55:1 → 3,2:1), rouge d'erreur distinct du bordeaux, colonne de lecture (42rem à 17 px ≈ 90 caractères → 36rem à 18 px ≈ 75), mouvement réduit qui garde les fondus, animation IA seulement au survol et pendant le travail, `themeColor` aligné sur le fond réel. |

Rejeté par l'utilisateur, à ne jamais reproposer : métaphores décoratives (classeur à lignes Seyès, signet-ruban, cartes-livres à pages empilées), bandeaux de couleur selon le mode, titres Massilia énormes, CSS maison à la place de composants éprouvés, écran qui ressemble à un outil technique, liste de tous les inscrits.

---

## 2. Tokens

Tous les tokens vivent dans `src/styles/tokens.css` (importé par `globals.css`). Aucune couleur en dur dans un composant : `bg-primary`, `text-brand-text`, `text-muted-foreground`, etc.

### 2.1 Échelles de couleur

RUI « You need more colors than you think », « Define your shades up front ».

**Bordeaux** `--brand-50…950` : `50 #fdf2f4` · `100 #fbe5ea` · `200 #f6c7d1` · `300 #ee9aac` · `400 #e2627f` · `500 #cc2f52` · **`600 #a10e2f`** · `700 #870a26` · `800 #6e0a20` · `900 #570b1c` · `950 #33060f`.

**Gris chauds** `--gray-*` (teinte ≈ 340°, RUI « Greys don't have to be grey ») : `0 #ffffff` · `25 #fbfafa` · `50 #f6f4f4` · `100 #f3f0f1` · `150 #ebe7e8` · `200 #e7e2e4` · `300 #d5ced1` · `400 #a99fa3` · `500 #8c8286` · `600 #6c6266` · `700 #4f464a` · `800 #322c2f` · `850 #262123` · `900 #1e1a1c` · `950 #151213` · `975 #110e0f`.

### 2.2 Rôles (clair et sombre)

| Variable | Clair | Sombre | Usage |
|---|---|---|---|
| `--background` | `#fbfafa` | `#151213` | fond de page (niveau 0) |
| `--foreground` | `#1f1619` (17:1) | `#f4f1f2` (16,6:1) | texte |
| `--card` | `#ffffff` | `#1e1a1c` | carte, panneau (niveau 1) |
| `--popover` | `#ffffff` | `#262123` | menu, popover, toast (niveau 3) |
| `--dialog` | `#ffffff` | `#2c2629` | dialogue, feuille (niveau 4) |
| `--primary` | `#a10e2f` (blanc 8:1) | `#b8153a` (blanc 6,6:1) | action principale, seulement en fond |
| `--primary-hover` | `#870a26` | `#cc2f52` | survol de l'action principale |
| `--primary-foreground` | `#ffffff` | `#ffffff` | texte sur `--primary` |
| `--secondary`, `--muted`, `--accent` | `#f3f0f1` | `#2a2527` | fonds neutres |
| `--muted-foreground` | `#6c6266` (5,6:1) | `#a99fa3` (7,3:1) | texte secondaire |
| `--border` | `#e7e2e4` | `#322c2f` | bordure décorative |
| `--input` | `#948a8e` (3,2:1) | `#7a7074` (3,9:1) | bordure de champ, case, interrupteur éteint |
| `--ring` | `#a10e2f` | `#f08aa0` | focus visible |
| `--brand-tint` | `#fbeef1` | `#331820` | fond de l'élément actif |
| `--brand-text` | `#8a0c29` (8,6:1 sur tint) | `#f6a9b9` (8,7:1 sur tint) | texte de l'élément actif, texte de marque |
| `--link` | `#a10e2f` (7,7:1) | `#f08aa0` (7,9:1) | liens |
| `--sidebar` / `--sidebar-foreground` | `#f6f4f4` / `#3f3438` | `#110e0f` / `#cfc7ca` | barre latérale |
| `--sidebar-accent` | `#ebe7e8` | `#241f21` | survol dans la barre |
| `--paper` | `#ffffff` | `#1e1a1c` | surface de lecture (crème : `#fbf6e9` / `#1f1b16`) |
| `--highlighter` / `--highlighter-ink` | `#fde68a` / `#1f1619` | `#7a6410` / `#fff8dc` | sélection, surlignage |

Règle : en sombre, le bordeaux plein est illisible comme texte (2,3:1). Le texte de marque est toujours `--brand-text` ou `--link`, jamais `text-primary`. La variante `link` de `Button` utilise `text-link`.

### 2.3 États

Toujours icône + mot (§6). Convention des variables : `--x` = couleur pleine (fond avec texte blanc en clair, texte en sombre), `--x-foreground` = texte sur teinte claire, `--x-tint` = fond teinté.

| État | `--x` clair | `--x-foreground` clair | `--x-tint` clair | `--x` sombre | `--x-foreground` sombre | `--x-tint` sombre | Icône |
|---|---|---|---|---|---|---|---|
| Succès `success` | `#15803d` (blanc 5:1) | `#166534` | `#f0fdf4` | `#4ade80` | `#86efac` | `#0f2a1a` | `IconSuccess` |
| Attention `warning` | `#b45309` (blanc 5:1) | `#92400e` | `#fffbeb` | `#fbbf24` | `#fde68a` | `#2b2010` | `IconWarning` |
| Danger `destructive` | `#dc2626` (blanc 4,8:1) | `#991b1b` | `#fef2f2` | `#f87171` | `#fca5a5` | `#2e1414` | `IconError` |
| Info `info` | `#2563eb` | `#1d4ed8` | `#eff6ff` | `#60a5fa` | `#bfdbfe` | `#0f1d33` | `IconInfo` |

- `--danger-solid: #dc2626` dans les deux thèmes : fond du bouton de confirmation destructive (texte blanc 4,8:1).
- Le danger (rouge vif, teinte 0°) est distinct du bordeaux (345°). Il n'est plein que dans la confirmation d'une action destructive.
- En sombre, pas de badge plein `success`/`warning`/`info` avec texte blanc : variantes `-light` seulement.
- « À corriger » (cours renvoyé à l'auteur) est un état **attention**, pas un danger. Le rouge sert à « Masqué » et aux erreurs.

### 2.4 IA

Seule zone multicolore du site (§7).

| Variable | Clair | Contraste sur blanc | Sombre | Contraste sur `#1e1a1c` |
|---|---|---|---|---|
| `--ai-1` | `#a10e2f` | 7,7:1 | `#f6a9b9` | ≥ 8:1 |
| `--ai-2` | `#be185d` | 6:1 | `#f9a8d4` | ≥ 8:1 |
| `--ai-3` | `#7c3aed` | 5,7:1 | `#c4b5fd` | ≥ 8:1 |
| `--ai-4` | `#2563eb` | 5,2:1 | `#93c5fd` | ≥ 8:1 |

`--ai-stops: var(--ai-1), var(--ai-2), var(--ai-3), var(--ai-4), var(--ai-1)` est le **seul** dégradé IA. Pas d'orange (3,6:1, illisible en texte).

### 2.5 Accent personnel (Paramètres › Affichage)

L'accent ne change que l'élément actif (`--brand-tint`, `--brand-text` de la navigation, des onglets et des puces sélectionnées). **Jamais** `--primary`, jamais l'IA, jamais le mode Administration (classe `accent-*` ignorée sous `/admin`). Teintes 250 à 290° exclues (elles éteignent l'IA). Liste fermée :

| Clé | Tint clair | Texte clair | Tint sombre | Texte sombre |
|---|---|---|---|---|
| `bordeaux` (défaut) | `#fbeef1` | `#8a0c29` | `#331820` | `#f6a9b9` |
| `vert` | `#ecfdf5` | `#065f46` | `#0f2a22` | `#6ee7b7` |
| `sarcelle` | `#f0fdfa` | `#115e59` | `#0f2726` | `#5eead4` |
| `ambre` | `#fffbeb` | `#92400e` | `#2b2010` | `#fcd34d` |
| `ciel` | `#f0f9ff` | `#075985` | `#0c2433` | `#7dd3fc` |
| `graphite` | `#f1f5f9` | `#334155` | `#1e293b` | `#cbd5e1` |

```css
html.accent-vert { --brand-tint: #ecfdf5; --brand-text: #065f46; }
/* idem pour chaque clé, puis la version sombre sous les deux sélecteurs sombres (§2.10) */
```

Un test unitaire (`tests/contrast.test.ts`) vérifie ≥ 4,5:1 pour chaque couple texte/fond de §2.2 à §2.6, dans les deux thèmes.

### 2.6 Couleurs de nom (personnalisation)

Pas d'hexadécimal libre. Une couleur = une teinte OKLCH choisie dans une liste, la clarté est imposée par le thème pour garantir 4,5:1 sur `--card` :

- clair : `oklch(0.48 0.16 H)` ; sombre : `oklch(0.80 0.12 H)`.
- Teintes proposées (12) : `0` cerise, `20` corail, `45` orange, `70` ambre, `100` olive, `135` vert, `160` émeraude, `185` sarcelle, `210` ciel, `230` bleu, `320` magenta, `350` framboise. Aucune entre 250 et 290.
- Dégradé de nom : 2 arrêts **statiques**, choisis dans 8 paires fermées (`20→45` Braise, `135→185` Forêt, `185→210` Lagon, `45→350` Aube, `210→230` Ardoise, `70→45` Miel, `160→185` Menthe, `0→20` Cerise). Jamais la suite IA, jamais animé hors du profil, jamais en `forced-colors` (repli `CanvasText`).
- Les deux extrémités d'un dégradé passent le test de contraste.

### 2.7 Espacement

Échelle Tailwind (pas de 4 px). Valeurs autorisées : **4, 8, 12, 16, 24, 32, 48, 80** (`1, 2, 3, 4, 6, 8, 12, 20`). Grille de PUI (« Create a set of predefined spacing options ») + 4 et 12 pour le dense ; deux valeurs voisines diffèrent d'au moins 25 % (RUI « Establish a spacing system »).

| Contexte | Valeur |
|---|---|
| icône ↔ texte, dans un badge | 4 à 8 |
| entre champs, dans une carte | 12 à 16 |
| marge intérieure d'une carte | 16 (téléphone) / 24 (≥ 768) |
| entre groupes | 32 |
| entre sections d'une page | 48 |
| sections de la page publique | 80 |
| gouttière de page | 16 (< 768) / 24 (768 à 1023) / 32 (≥ 1024) |

### 2.8 Rayons

`--radius: 0.5rem`. Valeurs explicites (plus de calcul multiplicatif) :

| Token | Valeur | Usage |
|---|---|---|
| `--radius-sm` | 4 px | badge, `Kbd`, surlignage |
| `--radius-md` | 6 px | petit bouton, puce |
| `--radius-lg` | 8 px | bouton, champ, élément de menu |
| `--radius-xl` | 12 px | carte, panneau, carte de cours |
| `--radius-2xl` | 16 px | feuille, dialogue, tuile « Commencer avec… » |
| `--radius-full` | 9999 px | avatar, pastille, interrupteur, + de la barre d'onglets |

Imbrication : rayon intérieur = rayon extérieur − marge. Image collée au bord d'une carte : 12 px en haut, 0 en bas.

### 2.9 Ombres et élévation

RUI « Use shadows to convey elevation », « Shadows can have two parts » ; PUI : 3 à 4 niveaux, lumière d'en haut, teinte la plus sombre de la palette.

```css
@theme {
  --shadow-xs: 0 0 0 1px var(--border), 0 1px 2px rgb(31 22 25 / .05);                                              /* 1 : carte posée */
  --shadow-sm: 0 0 0 1px var(--border), 0 2px 4px -1px rgb(31 22 25 / .06), 0 4px 12px -2px rgb(31 22 25 / .08);   /* 2 : carte survolée, barre collante */
  --shadow-md: 0 0 0 1px rgb(31 22 25 / .06), 0 4px 6px -2px rgb(31 22 25 / .08), 0 12px 24px -6px rgb(31 22 25 / .14); /* 3 : menu, popover, toast */
  --shadow-lg: 0 0 0 1px rgb(31 22 25 / .06), 0 8px 16px -4px rgb(31 22 25 / .10), 0 24px 48px -12px rgb(31 22 25 / .28); /* 4 : dialogue, feuille */
  --shadow-xl: var(--shadow-lg);
}
```

En sombre, l'élévation passe par la surface (PUI « Use colour to add depth ») : niveau 0 `#151213`, 1 `#1e1a1c`, 3 `#262123`, 4 `#2c2629`, et un liseré haut :

```css
/* sous les deux sélecteurs sombres */
--shadow-xs: 0 0 0 1px var(--border);
--shadow-sm: 0 0 0 1px var(--border), inset 0 1px 0 rgb(255 255 255 / .04);
--shadow-md: 0 0 0 1px rgb(255 255 255 / .06), inset 0 1px 0 rgb(255 255 255 / .05), 0 12px 24px -6px rgb(0 0 0 / .5);
--shadow-lg: 0 0 0 1px rgb(255 255 255 / .07), inset 0 1px 0 rgb(255 255 255 / .06), 0 24px 48px -12px rgb(0 0 0 / .6);
```

### 2.10 Thème sombre

Trois états : système (aucune préférence), clair (`html.light`), sombre (`html.dark`). Chaque bloc sombre est écrit deux fois :

```css
@media (prefers-color-scheme: dark) { :root:not(.light) { /* tokens sombres */ } }
:root.dark { /* mêmes tokens sombres */ }
```

`themeColor` de `layout.tsx` : `#fbfafa` (clair) et `#151213` (sombre).

### 2.11 Typographie

PUI « Use a single sans serif typeface » (Massilia apporte l'émotion des titres), « Use at least 1.5 line height » ; RUI « Establish a type scale », « Line-height is proportional ».

| Classe | Taille / interligne | Police, graisse | Usage |
|---|---|---|---|
| `.display` (alias `.display-1`) | 36 → 48 px (≥ 768) / 1.1 | Massilia 700 | page publique seulement |
| `.title` (alias `.display-2`) | 24 → 30 px / 1.2 | Massilia 600 | titre de page, un par écran |
| `.heading` (alias `.section-title`) | 18 px / 1.35 | Massilia 600 | titre de section, reste petit |
| `text-lg` + `.read` | 18 px / 1.7 | police de lecture 400 | texte d'un cours, fiches, quiz |
| `text-base` | 16 px / 1.5 | Source Sans 3 400/600 | interface |
| `text-sm` | 14 px / 1.45 | 400/600 | métadonnées, boutons, badges |
| `text-xs` | 12 px / 1.35 | 600 | compteurs, `Kbd` ; jamais une phrase |

- Graisses : 400 et 600 ; 700 pour `.display` seulement. `font-synthesis: none` sur `html`.
- Chiffres : `tabular-nums` dans compteurs, crédits, scores, tableaux ; alignés à droite dans les tableaux (RUI).
- Majuscules : jamais en bloc (PUI « Limit the use of UPPERCASE »). Casse de phrase partout.
- Titres : `text-wrap: balance` ; texte courant : `text-wrap: pretty`.
- Césure : `hyphens: manual` dans les zones de lecture ; `hyphens: auto` + `overflow-wrap: break-word` pour les titres de cartes (avec `lang="fr"` sur `html`). Plus jamais `overflow-wrap: anywhere`.

### 2.12 Mesure de lecture

```css
:root { --measure: 36rem; }      /* ≈ 75 caractères en Source Sans 3 à 18 px */
html.measure-narrow { --measure: 30rem; } /* ≈ 62 caractères */
```

La colonne est en rem : une police plus large donne moins de caractères par ligne, sans dépasser la colonne.

### 2.13 Couches (z-index)

`--z-sticky: 20` (barre d'actions collante) · `--z-header: 30` (en-tête) · `--z-tabbar: 40` (barre d'onglets, barre de lecture) · `--z-overlay: 50` (feuille, dialogue, palette) · `--z-toast: 60` · `--z-progress: 70` (barre de chargement de page).

### 2.14 Courbes, durées, mouvement

```css
@theme {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);      /* entrées, survol */
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);       /* sorties */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* déplacement d'un point à un autre */
  --ease-back: cubic-bezier(0.34, 1.56, 0.64, 1);  /* récompense, léger dépassement */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* feuilles et panneaux latéraux */
  --dur-instant: 100ms;  /* appui, couleur */
  --dur-fast: 150ms;     /* survol, interrupteur, sortie de menu */
  --dur-base: 200ms;     /* menu, popover, onglet */
  --dur-slow: 300ms;     /* feuille, dialogue, page */
  --dur-reward: 450ms;   /* badge, score, élément partagé */
  --animate-rise: rise var(--dur-slow) var(--ease-out) both;
  --animate-pop: pop var(--dur-reward) var(--ease-back) both;
}
:root { --motion: 1; } /* multiplie toutes les distances ; 0 = fondus seuls */
@keyframes rise { from { opacity: 0; transform: translateY(calc(8px * var(--motion))); } }
@keyframes pop { from { opacity: 0; transform: scale(calc(1 - .2 * var(--motion))); } }
```

Ressorts `motion` (dans `src/lib/motion.ts`) : `snappy { type: "spring", stiffness: 500, damping: 38 }` (interface), `sheet { stiffness: 300, damping: 32 }`, `reward { stiffness: 380, damping: 16 }`. Une sortie dure environ 2/3 de l'entrée. Cascade de liste : 30 ms par élément, 8 au plus, le reste d'un bloc. On n'anime que `transform`, `opacity` (et `filter` pour la lueur IA).

### 2.15 Variantes Tailwind communes (`tokens.css`)

```css
@custom-variant hover-ok { @media (hover: hover) and (pointer: fine) { &:hover { @slot; } } }
@custom-variant coarse { @media (pointer: coarse) { @slot; } }
@custom-variant fine { @media (pointer: fine) { @slot; } }
@custom-variant motion-ok { @media (prefers-reduced-motion: no-preference) { html:not(.reduce-motion) & { @slot; } } }
@utility pb-safe { padding-bottom: max(0.5rem, env(safe-area-inset-bottom)); }
@utility pt-safe { padding-top: env(safe-area-inset-top); }
@utility px-safe { padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right)); }
:root { --tabbar-h: 3.5rem; --bottom-offset: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); }
@media (min-width: 1024px) { :root { --bottom-offset: 0px; } }
```

Tout élément fixé en bas (toast, barre d'actions, barre de décision) se place à `bottom: calc(var(--bottom-offset) + 0.5rem)`. Tout déplacement au survol passe par `hover-ok:` et `motion-ok:` (`hover-ok:motion-ok:-translate-y-0.5`).

---

## 3. Hiérarchie et densité

1. **Pyramide des actions** : une pleine, une ou deux `outline`, le reste `ghost` ou « … ». Une action destructive n'est rouge et pleine que dans sa confirmation.
2. **Densité par contexte** : lecture aérée (18 px, 1,7) ; gestion (Mes documents, admin) dense : lignes de 44 px au toucher, 36 px à la souris (`DataGrid` compact). Le réglage « Mode compact » (Paramètres) passe l'interface en densité gestion.
3. **Accent par bordure** plutôt qu'aplat : encadrés de cours, élément actif du sommaire (RUI « Add color with accent borders »).
4. **Répétitions supprimées** : une matière sans cours s'affiche atténuée avec « 0 cours », pas « Rien pour l'instant » répété (PUI « Remove repeated elements »).
5. **Pas de cadre dans un cadre** : un `Card` ne contient pas de `Frame`.
6. **Les chiffres d'abord** : chiffre en `text-2xl tabular-nums`, mot en `text-sm text-muted-foreground` dessous (composant `Stat`).
7. **Écrans de travail** (admin, modération) : pas de chiffres qui défilent, pas de célébration.

---

## 4. Composants

### 4.1 Table d'usage

| Besoin | Composant | Règle |
|---|---|---|
| Bouton | `Button` (shadcn) | Tailles en `min-h-*` (`default` : `min-h-9 h-auto py-1.5`, `sm` : `min-h-8`), pas de `whitespace-nowrap` imposé ; `min-h-11` sous `coarse`. Prop `pending` : l'icône devient `Spinner`, largeur figée. Variante `danger` : `bg-[var(--danger-solid)] text-white`, réservée aux confirmations. Variante `link` : `text-link`. |
| Bouton IA | `AiButton` (`components/ai`) | §7 |
| Carte de cours | `DocCard` | §4.2 |
| Carte générique | `Card` (shadcn) | `shadow-xs`, rayon 12 px, marge 16/24 |
| Liste | `Item` (shadcn) | remplace `.line-link` : `ItemMedia`, `ItemContent`, `ItemActions` (« … »). 44 px au toucher |
| Tableau de données | `DataGrid` + `Filters` (ReUI) | admin, Mes documents en vue liste ; tri, colonnes, sélection, actions groupées ; état dans l'URL. Au téléphone : liste `Item`, filtres en feuille basse |
| Graphique | `ChartContainer` (shadcn Chart, Recharts) | statistiques d'administration : période en `--chart-1` (aire ou colonnes), période précédente en `--chart-5` pointillé ; infobulle au survol (date, valeur, valeur précédente, écart) ; axes sans trait, graduations en `muted-foreground` ; pas d'animation (écran de travail). Classements : `BarList` (barres HTML, infobulle, lien vers le détail) |
| Filtre à bascule | `ToggleGroup` ou puce `Filters` | Favoris = puce `IconFavorite` |
| Onglets | `SegmentedTabs` (sur `Tabs` Base UI) | indicateur animé 200 ms ; défilement horizontal avec masque de bord au téléphone ; compteur en `Badge` |
| Menu d'actions | `ResponsiveMenu` | `DropdownMenu` sous `fine`, `Sheet` basse sous `coarse`, mêmes entrées |
| Feuille | `ResponsiveSheet` | `Dialog` centré ≥ 768 et `fine`, `Sheet side="bottom"` sinon (poignée, glisser pour fermer, crans 50 % et 90 %) ; ferme au retour système (`popstate`) ; rend le focus au déclencheur |
| Panneau latéral | `Sheet side="right"` | détails, filtres, notes sur ordinateur ; 400 à 560 px |
| Confirmation | `ConfirmDialog` | trois niveaux : simple, danger (`danger`), critique (saisie du nom). Une action réversible n'a pas de confirmation mais un toast « Annuler » |
| Toast | `Sonner` (`components/ui/sonner.tsx`, `<Toaster>` monté dans `layout.tsx`) | `lib/toast.ts` : `toast(msg)` 4 s, `toastUndo(msg, onUndo)` 6 s. Bas droite sur ordinateur ; bas centre au-dessus de la barre d'onglets au téléphone. Jamais pour une erreur de formulaire (elle va sous le champ). Pas de toast pour un enregistrement automatique (coche « Enregistré » à côté du champ) |
| État vide | `EmptyState` (sur `Empty`) | tuile `bg-brand-tint` + icône 24 px, une phrase, une action. Variante `ai` (bordure IA) quand l'action proposée est IA |
| En-tête de page | `PageHeader` | titre `.title`, action principale à droite (ordinateur) ou dans la barre basse (téléphone), onglets en dessous ; pas de chapeau qui répète le titre |
| Barre d'actions collante | `StickyActionBar` | bas d'écran au-dessus de `--bottom-offset`, `pb-safe`, ombre `shadow-md` |
| Statut | `StatusBadge` | statut → couleur + icône + mot (§4.4) |
| Chiffre | `Stat` | chiffre puis mot |
| Avatar | `Avatar` | repli sur les initiales partout (jamais de cercle vide) |
| Nom d'une personne | `UserName` | variante `dense` (police standard, couleur seule) dans listes, commentaires, admin ; `rich` (police, dégradé, badge) sur profil, fiche ami, ligue, classement, signature d'un cours |
| Ajouter un ami | `FriendQuickAdd` | mon code en 2 groupes `A3F9C-1E7B2` (mono), Copier, Partager (`navigator.share`), QR (popover ou feuille) ; champ « Code d'un ami » + Ajouter ; réponse identique que le code existe ou non |
| File de décision | `ReviewQueue` (coquille) | liste + aperçu centré + barre de décision collante, raccourcis communs (§4.5) |
| Création | `CreateSheet` « Commencer avec… » | §5.4 |
| Réglages de lecture | `ReadingSettings` « Aa » | popover (ordinateur) ou feuille (téléphone) : police, taille, espacement, largeur, thème ; mêmes contrôles dans Paramètres › Affichage |
| Sommaire | `Scrollspy` (ReUI) | marge droite de la page de cours |
| Statut, historique | `Badge`, `Timeline`, `Stepper` (ReUI) | historique de relecture, étapes |
| Saisie | `Autocomplete`, `DateSelector`, `NumberField`, `Rating` (ReUI) | date en `fr`, jamais le champ date natif |
| Réordonner | `Sortable` (ReUI) | vitrine de badges, matières en admin ; toujours avec boutons monter/descendre |
| Questions | `Accordion` (shadcn) | une ouverte à la fois |
| Recherche globale | `Command` (shadcn, cmdk) | `⌘K`/`Ctrl K`, `/` ; plein écran au téléphone |
| Raccourci | `Kbd` | masqué sous `coarse` |

Interdits côté composants : `Kanban` pour une file de traitement ; tableau transformé en cartes par CSS ; `select` natif dans l'interface (sauf repli de formulaire public) ; `<details>` pour cacher un formulaire principal.

### 4.2 Carte de cours (`DocCard`, effet carte gardé)

- Avec une **vraie couverture** : image 16:7 collée en haut (rayon 12/0), `loading="lazy"`.
- **Sans couverture** : couverture de remplacement à la même hauteur 16:7, pour que les cartes d'une grille restent alignées : dégradé doux dans la teinte de la matière (`coverHue`, palette `COVER_HUES`, même teinte partout pour une matière), trame de points à 16 %, sigle de la matière (`subjectSigle` : nom court, sinon initiales, sans emoji) en bas à gauche. `.subject-cover` en `light-dark()`, sigle ≥ 4,5:1. Pas d'illustration. La variante en ligne (`row`) n'a jamais de couverture.
- Pastille du chapitre (« CHAP. II ») en haut à gauche de la couverture : sur une image, fond voilé et flouté (`bg-black/45 backdrop-blur-md`, texte blanc) ; sur la couverture de remplacement ou en ligne, fond plein.
- Titre : `text-base font-semibold`, `line-clamp-2`, `hyphens:auto`, repli « Sans titre » si vide.
- Une ligne de faits en `text-sm text-muted-foreground` : matière ou enseignant, année ; puis `RatingSummary`, « 214 lecteurs ».
- **2 badges au plus** : catégorie (`primary-light`) + l'état le plus important (`StatusBadge`). Le semestre va dans la ligne de faits, le chapitre dans sa pastille.
- Étoile Favori en haut à droite, cible 44 px, hors du lien de la carte ; mise à jour optimiste + `toastUndo` ; `pop` 450 ms à l'activation ; état plein `[&_path]:fill-current`.
- Survol (`hover-ok:motion-ok:`) : `-translate-y-0.5` + `shadow-sm`, image `scale-[1.03]` ; appui : `scale-[.985]` 100 ms.
- Squelette aux mêmes dimensions (`DocCardSkeleton`).
- Grille par requêtes de conteneur : 1 colonne < 30rem, 2 < 52rem, 3 au-delà.
- `viewTransitionName: doc-<id>` sur le titre (§8.4).
- Props : `doc`, `meta?`, `status?`, `favorite?: boolean` (affiche l'étoile si défini), `variant?: "grid" | "row"`, `footer?: ReactNode` (statistiques de Mes documents).

### 4.3 Formulaires

- Libellé au-dessus, aide sous le champ seulement si utile, erreur sous le champ avec `IconError` et la façon de réparer.
- Champs à 16 px minimum (pas de zoom iOS), bordure `--input` (3:1).
- Enregistrement automatique : interrupteurs et choix tout de suite, textes à la perte de focus (600 ms de délai), coche `IconDone` « Enregistré » 1,2 s à côté du champ.
- Restent explicites : mot de passe, adresse, 2FA, suppression de compte, actions admin sensibles.

### 4.4 Statuts des documents (`StatusBadge`)

| Statut | Règle (colonnes) | Variante | Icône |
|---|---|---|---|
| Brouillon | non publié, pas de demande, pas de `reviewNote` | `secondary` | `IconDraft` |
| À corriger | non publié, pas de demande, `reviewNote` présent | `warning-light` | `IconToFix` |
| En attente | `reviewRequested` | `info-light` | `IconPending` |
| Publié | `published`, pas de `postReviewAt` | `success-light` | `IconPublished` |
| Publié, relecture à venir | `published` et `postReviewAt` | `success-outline` | `IconPublished` |
| Correction proposée | une `revisions` en attente | `primary-light` | `IconRevisionPending` |
| Masqué | `hiddenByReports` | `destructive-light` | `IconHiddenByReports` |
| (filtre) Corbeille | `deletedAt` non nul | `secondary` | `IconDelete` |

### 4.5 Raccourcis communs des files (`ReviewQueue`)

`J`/`K` (ou ↓/↑) suivant/précédent · `A` accepter, publier ou garder (`P` en alias) · `R` renvoyer, refuser ou retirer (ouvre les motifs) · `S` passer · `1`–`7` motif · `Entrée` confirmer · `Z` annuler la dernière décision · `E` ouvrir en pleine page · `/` rechercher · `?` aide. Inactifs dans un champ. Désactivables (WCAG 2.1.4) par la préférence `shortcuts: false`. Rappelés dans les `Tooltip` en `Kbd`.

Motifs de renvoi (mêmes numéros partout) : `1` Origine à préciser · `2` Incomplet ou trop court · `3` Mauvaise matière ou type · `4` Mise en forme à reprendre · `5` Document protégé (polycopié, manuel) · `6` Données personnelles visibles · `7` Doublon de… (lien).

---

## 5. Navigation et responsive

### 5.1 Appareils

| Appareil | Largeur | Navigation | Mise en page |
|---|---|---|---|
| Téléphone | < 768 px | barre d'onglets basse (5 cases), en-tête compact | 1 colonne, feuilles basses, action principale en bas au pouce |
| Tablette portrait | 768 à 1023 px | même barre d'onglets, centrée, 600 px au plus | 2 colonnes de cartes, feuilles basses ou latérales |
| Tablette paysage, petit portable | 1024 à 1279 px | barre latérale repliée en icônes par défaut (libellé en `Tooltip` à la souris) | 2 à 3 colonnes |
| Ordinateur | ≥ 1280 px | barre latérale dépliée (16rem), repliable (cookie `sidebar_state`) | 3 colonnes, marges de lecture |

**Conteneur de page.** Un seul : `pageContainer(type)` (`components/page-container.ts`), posé par `Shell` sur `<main>`, et par `LegalShell` et l'actualité hors coquille. Il porte la largeur maximale, les marges latérales (`PAGE_GUTTER` : 1rem, 1,5rem dès 768 px, 2rem dès 1024 px) et l'espacement haut et bas (1rem / 4rem, 1,5rem / 5rem dès 768 px). Une page choisit un **type**, jamais une largeur :

| Type | Largeur | Pages |
|---|---|---|
| `reading` | aucune au conteneur ; le texte est à `--measure` dans `DocFrame`, sommaire et notes dans ses marges | cours, éditeur, correction, nouveau document, actualité |
| `standard` (défaut) | 64rem | Accueil, Matières, une matière, Réviser et ses onglets, fiches, Amis, Demandes, Moi, Notifications, Paramètres, Profil, Groupes, Défis, Dates, Enseignant, pages légales, Actualités |
| `wide` | 80rem | administration, À valider, Mes documents |

Lu à 390 px : 1rem de marge partout ; à 820 px : 1,5rem, aucune largeur n'atteint son maximum, toutes les pages sont pareilles ; à 1440 px (barre latérale dépliée, 1184 px utiles) : `standard` centré avec 5rem de marge, `wide` et `reading` remplissent. Une page n'ajoute ni `mx-auto max-w-*` ni marge latérale autour de son contenu ; une colonne plus étroite (liste, formulaire, `max-w-2xl`) reste alignée à gauche, sous le titre. Seul débord permis : une bande défilante au téléphone en `-mx-4 px-4 md:mx-0 md:px-0`, égale à la marge. Hors conteneur : formulaires d'entrée (`PublicShell`, 24rem), séance et quiz plein écran (`SessionFrame`), accueil de bienvenue, présentation.

Pas de rail séparé, plus de burger. Les composants utilisent des **requêtes de conteneur** (`@container`) pour leur mise en page interne. Le **comportement** (survol, poignées, menus en feuille, sommaire en rail ou en feuille) dépend de `pointer: fine | coarse`, jamais de la largeur : un iPad avec souris a droit au survol.

### 5.2 Onglets du téléphone et barre latérale

| Mode | Barre d'onglets (< 1024) | Barre latérale (≥ 1024) |
|---|---|---|
| Lecture | Accueil `/` · Matières `/matieres` · **+** · Réviser `/reviser` · Moi `/moi` | Accueil, Matières, Réviser (pastille des fiches dues), Demandes, Amis (pastille des demandes) ; groupe « L1 · S1 » (étiquette = sélecteur d'année et de semestre) avec les matières du semestre ; pied : Nouveau (`outline`, ouvre `CreateSheet`), sélecteur de mode, carte du compte (menu : Profil, Paramètres, Actualités, Aide, Se déconnecter) |
| Édition (staff) | À valider `/moderation` · Mes documents `/contribuer` · **+** · Dates `/moderation/calendrier` · Moi | À valider, Mes documents, Dates ; même pied |
| Édition (membre) | Mes documents · Demandes · **+** · Moi | Mes documents, Demandes ; même pied |
| Administration | À traiter `/admin` · Contenus `/admin/contenus` · Personnes `/admin/personnes` · Suivi `/admin/suivi` · Moi | À traiter ; Contenus (Cours, Modération, Demandes, Licences et matières, Actualités, Annonces) ; Personnes (Personnes, Invitations) ; Suivi (Statistiques, Journal, Système, Réglages) |
| Enseignant | inchangé (un seul espace) | Mes matières |

- Administration : sur grand écran, la barre latérale est la seule navigation entre sections (pas de barre d'onglets « Sections » sous le titre). Sous 1024 px, l'en-tête garde les sous-sections de l'onglet courant (`AdminHeader`, `lg:hidden`), seul chemin vers Modération, Licences, Actualités, Annonces, Invitations, Journal, Système et Réglages ; Suivi liste aussi Statistiques, Journal, Système, Réglages et Charte.
- Onglet actif : couleur `--brand-text`, pastille `bg-brand-tint` qui glisse d'un onglet à l'autre (`layoutId`, ressort `snappy`), libellé en 600, icône 24 px trait 2. Libellés toujours visibles (PUI : une navigation basse sans libellés est confuse).
- Le **+** est le seul bouton de création flottant ou central : disque bordeaux de 44 px dans la case, il ouvre `CreateSheet`. Dans une matière, il préremplit la matière.
- Le changement de mode se fait dans Moi (téléphone) et dans le pied de la barre latérale (ordinateur).
- En-tête du téléphone : logo (pages racines) ou chevron retour (au-delà du premier niveau), titre, loupe (palette plein écran), cloche. Pas d'avatar (il est dans Moi).
- Sur la page d'un cours (téléphone), la barre de lecture (Sommaire · Notes · **Réviser** · ⋯) remplace la barre d'onglets ; les deux se cachent au défilement vers le bas et reviennent vers le haut (200 ms), sauf préférence `fixedBars` (zoom à 200 %, lecteurs d'écran).
- Hauteur de barre : 56 px + `env(safe-area-inset-bottom)`.

### 5.3 Cibles et gestes

- 44 × 44 px minimum sous `coarse` (`min-h-11`) ; petite icône : zone étendue invisible `relative after:absolute after:-inset-3`. 8 px entre deux cibles.
- Rien ne dépend du survol : ce qui apparaît au survol est visible ou dans « … » au toucher.
- Aucune capture du bord gauche (20 px, retour iOS). Pas de « tirer pour actualiser ». Pas de glisser pour une décision de modération ou une action admin.

### 5.4 Feuille « Commencer avec… » (`CreateSheet`)

Ordre fixe, une ligne par entrée (tuile de 72 px), la première deux fois plus haute et au style IA :

1. **Photo ou PDF avec Campuss IA** (`IconAiScan`, `ai-border`) → `/contribuer/nouveau?depart=photo` (au téléphone, ouvre directement l'appareil photo une fois sur l'éditeur).
2. **Écrire** (`IconEdit`) → `/contribuer/nouveau`.
3. **Importer de Notion** (`IconNotion`) → `/contribuer/nouveau?depart=notion` ; **Importer de Google Docs** (`IconGoogleDocs`) → `?depart=google` ; **Fichier** (`IconUpload`) → `?depart=fichier`. Absentes si `features.imports` est coupé ou si le fournisseur n'est pas configuré.
4. **Demander un cours** (`IconRequests`) → `/demandes?nouvelle=1`.
5. **Fiche mémo** (`IconCards`) → `/reviser/fiches?nouvelle=1`.

Le contexte ajoute `&matiere=<id>`. Ordinateur : `Dialog` de 28rem ; téléphone : feuille basse.

### 5.5 Zones sûres, clavier, préparation des applications Android et iOS

- `viewportFit: "cover"` (déjà) et `interactiveWidget: "resizes-content"` dans `viewport`.
- En-tête : `pt-safe` ; barres basses, feuilles, toasts : `pb-safe` ; paysage : `px-safe`.
- `100dvh`, jamais `100vh`. `overscroll-behavior: contain` dans les feuilles.
- Toute surface superposée (feuille, palette, dialogue, visionneuse) pousse une entrée d'historique et se ferme au `popstate` (hook `useBackToClose`) : le retour Android ferme la feuille au lieu de quitter la page.
- Tout état utile tient dans l'URL (filtres, semestre, onglet, `?note=`) pour les liens profonds.
- OAuth tiers par le navigateur système dans l'application : `returnTo` accepte un chemin relatif en liste blanche ou `campuss://…`.
- Pas de survol, pas de geste de bord, vibrations par `navigator.vibrate` (Android) puis le plugin Haptics.
- Correspondance future : barre d'onglets → onglets natifs ; `ResponsiveSheet` → feuilles natives ; barre d'accessoires de l'éditeur → `inputAccessoryView`.
- PWA d'abord (manifeste, `sw.js`, `share_target` existent), coque Capacitor ensuite. Piège : Apple refuse une simple vue web (règle 4.2), d'où push, partage, appareil photo, hors ligne.

---

## 6. Icônes Hugeicons

`@hugeicons/core-free-icons` (style stroke rounded) + `@hugeicons/react`. On n'importe **jamais** une icône directement depuis le paquet dans un composant : on passe par `src/lib/icons.ts`, qui réexporte sous un nom de fonction, et par `src/components/icon.tsx` :

```ts
// src/lib/icons.ts : une fonction, une icône. Réexports nommés : le tri des imports inutilisés reste possible.
export { Home01Icon as IconHome, Book02Icon as IconSubjects /* … */ } from "@hugeicons/core-free-icons";
```

```tsx
// src/components/icon.tsx
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
export function Icon({ icon, size = 20, strokeWidth, label, className }: { icon: IconSvgElement; size?: 16 | 20 | 24 | 32; strokeWidth?: number; label?: string; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth ?? (size === 32 ? 1.5 : 1.75)} className={className} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} />;
}
```

Règles : tailles 16 (badge, `text-sm`), 20 (défaut : boutons, listes, barre latérale), 24 (barre d'onglets, tuile d'état vide), 32 (récompenses). Trait 1,75 ; 1,5 à 32 px ; 2 pour l'onglet actif. Couleur `currentColor`, plus discrète que le texte voisin (`text-muted-foreground`) sauf élément actif. Une icône seule porte `label` ; à côté d'un texte elle est décorative. État plein : `[&_path]:fill-current`. `components.json` : `"iconLibrary": "hugeicons"`. Une icône manquante : l'ajouter à `icons.ts` (dans la section de son domaine), après avoir vérifié qu'elle existe : `ls node_modules/@hugeicons/core-free-icons/dist/types/ | grep -i nom`.

Toutes les icônes ci-dessous existent dans le paquet installé (vérifié le 2026-11-03).

| Export | Hugeicons | Fonction |
|---|---|---|
| **Navigation** | | |
| `IconHome` | `Home01Icon` | Accueil |
| `IconSubjects` | `Book02Icon` | onglet Matières, matière |
| `IconProgram` | `Mortarboard01Icon` | licence, année |
| `IconRevise` | `Target02Icon` | Réviser |
| `IconRequests` | `MessageQuestionIcon` | Demandes |
| `IconFriends` | `UserGroupIcon` | Amis |
| `IconMe` | `UserCircleIcon` | Moi, profil |
| `IconSettings` | `Settings01Icon` | Paramètres |
| `IconNews` | `News01Icon` | Actualités |
| `IconSearch` | `Search01Icon` | recherche |
| `IconNotifications` | `Notification01Icon` | notifications |
| `IconModeRead` / `IconModeEdit` / `IconModeAdmin` | `BookOpen01Icon` / `PencilEdit02Icon` / `ShieldUserIcon` | modes |
| `IconClose` | `Cancel01Icon` | fermer |
| `IconBack` / `IconChevronRight` | `ArrowLeft01Icon` / `ArrowRight01Icon` | retour, chevron de liste |
| `IconExpand` / `IconCollapse` | `ArrowDown01Icon` / `ArrowUp01Icon` | déplier, replier |
| `IconSidebar` | `SidebarLeftIcon` | replier la barre latérale |
| `IconMore` | `MoreHorizontalIcon` | « … » |
| `IconLogout` | `Logout03Icon` | se déconnecter |
| `IconExternal` | `LinkSquare02Icon` | lien externe |
| `IconHelp` / `IconKeyboard` | `HelpCircleIcon` / `KeyboardIcon` | aide, raccourcis |
| **Actions** | | |
| `IconAdd` | `PlusSignIcon` | nouveau, + |
| `IconEdit` | `PencilEdit01Icon` | modifier, écrire |
| `IconDelete` / `IconArchive` / `IconRestore` | `Delete02Icon` / `Archive01Icon` / `RestoreBinIcon` | supprimer, archiver, restaurer |
| `IconShare` / `IconLink` / `IconCopy` | `Share08Icon` / `Link01Icon` / `Copy01Icon` | partager, lien, copier |
| `IconDownload` / `IconUpload` / `IconCloudUpload` | `Download04Icon` / `Upload04Icon` / `CloudUploadIcon` | télécharger, importer, déposer |
| `IconAttach` / `IconCamera` / `IconImage` / `IconImageAdd` | `Attachment01Icon` / `Camera01Icon` / `Image01Icon` / `ImageUpload01Icon` | pièce jointe, photo, image, ajouter une image |
| `IconFile` | `FileAttachmentIcon` | fichier |
| `IconSend` | `SentIcon` | envoyer, publier |
| `IconFilter` / `IconSort` | `FilterHorizontalIcon` / `ArrowUpDownIcon` | filtrer, trier |
| `IconFavorite` | `StarIcon` | favori (plein par `fill-current`) |
| `IconUndo` / `IconRedo` / `IconRefresh` | `Undo02Icon` / `Redo02Icon` / `RefreshIcon` | annuler, rétablir, régénérer |
| `IconGrid` / `IconList` | `GridViewIcon` / `ListViewIcon` | vue grille, vue liste |
| `IconPin` | `PinIcon` | épingler |
| `IconQr` | `QrCode01Icon` | QR |
| `IconFlag` | `Flag01Icon` | signaler |
| `IconEye` / `IconHidden` | `EyeIcon` / `ViewOffIcon` | aperçu, voir comme / privé |
| `IconThanks` | `ThumbsUpIcon` | Merci, vote |
| **Éditeur et lecture** | | |
| `IconDragHandle` | `DragDropVerticalIcon` | poignée de bloc |
| `IconBold` / `IconItalic` / `IconUnderline` / `IconStrike` | `TextBoldIcon` / `TextItalicIcon` / `TextUnderlineIcon` / `TextStrikethroughIcon` | mise en forme |
| `IconHighlight` / `IconNote` / `IconComment` | `HighlighterIcon` / `StickyNote01Icon` / `Comment01Icon` | surligner, note en marge, commentaire |
| `IconToc` | `TableOfContentsIcon` | sommaire |
| `IconText` / `IconH2` / `IconH3` | `TextIcon` / `Heading02Icon` / `Heading03Icon` | blocs texte |
| `IconBulletList` / `IconNumberList` / `IconCheckList` | `LeftToRightListBulletIcon` / `LeftToRightListNumberIcon` / `CheckListIcon` | listes |
| `IconQuote` / `IconCallout` / `IconTip` | `QuoteDownIcon` / `InformationCircleIcon` / `BulbIcon` | citation, encadré, à retenir |
| `IconTable` / `IconFormula` / `IconDivider` / `IconCode` | `Table01Icon` / `SquareRootSquareIcon` / `MinusSignIcon` / `CodeIcon` | insertion |
| `IconVideo` / `IconYoutube` / `IconAudio` | `Video01Icon` / `YoutubeIcon` / `MusicNote01Icon` | médias |
| `IconSaved` / `IconSaving` | `CloudSavingDone01Icon` / `Loading03Icon` | état d'enregistrement |
| **Services** | | |
| `IconNotion` / `IconGoogleDocs` / `IconGoogleDrive` | `Notion01Icon` / `GoogleDocIcon` / `GoogleDriveIcon` | comptes connectés |
| **Statuts** | | |
| `IconDraft` | `FileEditIcon` | brouillon |
| `IconPending` | `HourglassIcon` | en attente |
| `IconPublished` / `IconSuccess` | `CheckmarkCircle02Icon` | publié, succès |
| `IconReviewed` / `IconDomainOk` | `CheckmarkBadge01Icon` | relu par un délégué, domaine vérifié |
| `IconToFix` / `IconWarning` | `Alert02Icon` | à corriger, attention |
| `IconError` | `AlertCircleIcon` | erreur, danger |
| `IconInfo` | `InformationCircleIcon` | info |
| `IconRejected` | `CancelCircleIcon` | refusé |
| `IconHiddenByReports` | `Flag01Icon` | masqué |
| `IconRevisionPending` | `Comment01Icon` | correction proposée |
| `IconLocked` / `IconUnlocked` | `SquareLock02Icon` / `SquareUnlock02Icon` | verrouillé, débloqué |
| `IconDone` | `Tick02Icon` | enregistré, coche |
| **Révision et jeu** | | |
| `IconStreak` / `IconRestDay` | `FireIcon` / `SnowIcon` | série, jour de repos |
| `IconCredits` / `IconXp` / `IconLevel` | `Coins01Icon` / `FlashIcon` / `CrownIcon` | crédits, XP, niveau |
| `IconBadge` / `IconMedal` / `IconTrophy` | `Award01Icon` / `Medal01Icon` / `ChampionIcon` | badge, médaille, trophée |
| `IconRanking` | `RankingIcon` | classement |
| `IconQuiz` / `IconCards` | `Quiz02Icon` / `Cards01Icon` | quiz, fiches |
| `IconTimer` / `IconGoal` | `Timer02Icon` / `Target01Icon` | chrono, objectif |
| `IconTogether` / `IconDuel` | `UserMultiple02Icon` / `Sword01Icon` | réviser à plusieurs, défier |
| `IconCalendar` | `Calendar03Icon` | partiels, dates |
| `IconGift` | `GiftIcon` | palier atteint |
| **Amis** | | |
| `IconAddFriend` / `IconRemoveFriend` / `IconBlock` | `UserAdd01Icon` / `UserRemove01Icon` / `UserBlock01Icon` | amis |
| `IconReact` | `SmileIcon` | réaction |
| **IA** | | |
| `IconAi` | `SparklesIcon` | marque Campuss IA |
| `IconAiChat` | `AiChat02Icon` | discuter avec Campuss IA |
| `IconAiScan` | `AiScanTextIcon` | photo ou PDF → cours |
| `IconAiTranscribe` | `AiTranscribeAudioIcon` | transcription audio (futur) |
| `IconAiIdea` | `AiIdeaIcon` | suggestions (titre, matière) |
| `IconAiCards` | `AiBookIcon` | fiches générées |
| `IconAiQuiz` | `AiGenerateIcon` | quiz généré |
| `IconAiSummary` | `AiContentGenerator01Icon` | résumé |
| `IconAiRewrite` | `AiEditingIcon` | reformuler |
| `IconAiSearch` | `AiSearch02Icon` | recherche IA (futur) |
| **Affichage** | | |
| `IconLight` / `IconDark` / `IconSystem` | `Sun03Icon` / `Moon02Icon` / `ComputerIcon` | thème |
| `IconFont` / `IconSpacing` / `IconWidth` | `TextFontIcon` / `LetterSpacingIcon` / `TextWrapIcon` | réglages de lecture |
| `IconAccessibility` / `IconReading` | `AccessibilityIcon` / `GlassesIcon` | accessibilité, lecture |
| `IconPalette` / `IconBrush` | `PaintBoardIcon` / `PaintBrush01Icon` | affichage, personnalisation |
| `IconSound` | `VolumeHighIcon` | sons et vibrations |
| `IconPhone` / `IconTablet` / `IconLaptop` | `SmartPhone01Icon` / `Tablet01Icon` / `LaptopIcon` | appareils |
| **Compte et administration** | | |
| `IconUser` / `IconSecurity` / `IconKey` / `IconPasskey` | `UserIcon` / `Shield01Icon` / `Key01Icon` / `ShieldKeyIcon` | compte, sécurité, mot de passe, clé d'accès |
| `IconMail` / `IconInvite` | `Mail01Icon` / `MailSend01Icon` | adresse, invitations |
| `IconPrivacy` | `LockKeyIcon` | confidentialité |
| `IconDashboard` / `IconTodo` | `DashboardSquare01Icon` / `InboxCheckIcon` | tableau de bord, À traiter |
| `IconPeople` / `IconUserEdit` / `IconUserCheck` / `IconSuspend` | `UserGroupIcon` / `UserEdit01Icon` / `UserCheck01Icon` / `UserLock01Icon` | personnes |
| `IconContent` | `Files01Icon` | contenus |
| `IconLicences` | `School01Icon` | licences et matières |
| `IconAnnouncement` | `Megaphone01Icon` | annonces |
| `IconStats` / `IconJournal` | `Analytics01Icon` / `WorkHistoryIcon` | statistiques, journal |
| `IconSystemHealth` / `IconSiteSettings` | `ServerStack01Icon` / `Settings02Icon` | système, réglages du site |
| `IconDatabase` / `IconBackup` | `Database01Icon` / `DatabaseRestoreIcon` | base, sauvegardes |

---

## 7. Langage visuel IA

### 7.1 Règles

1. Le dégradé IA n'existe que sur ce qui touche l'IA : boutons et entrées IA, zone qui génère, carte de résultat IA, badge « Campuss IA », état vide qui propose l'IA, section IA de la présentation. Ailleurs : ni dégradé, ni lueur, ni ombre colorée.
2. **Repos** : bordure dégradée fixe. **Survol ou focus** : lueur + rotation lente (4 s). **Travail** (`data-busy`) : rotation rapide (1,6 s) + shimmer. **Fini** : la lueur s'éteint en 600 ms.
3. **Une seule** bordure animée visible à l'écran (registre `useAiAnimationSlot`) ; les animations s'arrêtent hors écran (`IntersectionObserver` → `animation-play-state: paused`).
4. Texte en dégradé : 3 mots au plus (« Campuss IA », « Générer un quiz »), jamais le contenu généré.
5. Le contenu généré reste en `--foreground`, dans une `AiSurface` (bordure fine, fond teinté 6 %), avec la mention **« Généré par Campuss IA · à vérifier »** et, si pertinent, `IconThanks` (utile) et « Régénérer » (`IconRefresh`). Transparence (AI Act art. 50) : des fiches fausses sont un vrai danger pour un étudiant.
6. `IconAi` (`SparklesIcon`) = la marque ; chaque bouton porte l'icône de son action (§6).
7. Pas d'anthropomorphisme : « Campuss IA rédige… », jamais « Je pense ».
8. Sans clé IA (`env.aiApiKey` vide) ou `features.ai` coupé : tout point IA **disparaît** (pas de bouton grisé).

### 7.2 Inventaire des points d'apparition

| Lieu | Espace | Élément | Recette |
|---|---|---|---|
| `CreateSheet`, première entrée | commun | « Photo ou PDF avec Campuss IA » | tuile `ai-border ai-glow`, titre `ai-text` |
| Brouillon vierge, tuiles « Commencer avec… » | imports | tuile Photo ou PDF, deux fois plus large | idem |
| Transcription (OCR) en cours | imports | texte qui arrive page par page | carte `ai-surface` `data-busy`, 3 lignes `ai-skeleton` (100/92/64 %), libellé `ai-text-shimmer` « Campuss IA transcrit… », puis mention « à vérifier » |
| Suggestions de dépôt (titre, matière, type) | lecture | puces suggérées dans l'éditeur | puce avec `IconAiIdea` et liseré `ai-border` fixe ; disparaît à l'acceptation |
| Menu « / », groupe Campuss IA | lecture | « Transcrire une photo » | seule ligne colorée du menu : icône `IconAiScan` + libellé `ai-text` |
| Page de cours, « Réviser ▾ » | lecture | entrées « Générer des fiches », « Générer un quiz » | icône IA + libellé `ai-text` dans le menu |
| Page de cours, section Fiches | lecture | fiches générées | `AiSurface` + mention |
| Panneau Notes | lecture | « Faire des fiches avec mes surlignages » (bonus) | `AiButton` |
| Quiz généré (`/d/[id]/quiz`, génération en cours) | réviser | attente de génération | `ai-skeleton` + `ai-text-shimmer` « Campuss IA prépare le quiz… » |
| Séance, fiches IA | réviser | badge « Campuss IA » sur une fiche issue d'un paquet généré | `AiBadge` |
| Modération, onglet Fiches IA | contribution | fiches à garder ou retirer | `AiSurface` (sans animation : écran de travail) |
| Mes documents, état vide | contribution | tuiles de départ (`StartTiles`) | variante `ai` d'`EmptyState` |
| Réglages du site, section IA | admin | état et interrupteurs | `AiBadge` statique seulement |
| Présentation, section Campuss IA | présentation | démonstrations | `ai-surface`, bordure fixe, rotation seulement pendant une démo, arrêtée hors écran |

### 7.3 Recettes CSS (`src/styles/ai.css`)

```css
@property --ai-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
:root {
  --ai-1: #a10e2f; --ai-2: #be185d; --ai-3: #7c3aed; --ai-4: #2563eb;
  --ai-stops: var(--ai-1), var(--ai-2), var(--ai-3), var(--ai-4), var(--ai-1);
  --ai-tint: color-mix(in oklab, var(--ai-3) 6%, var(--card));
}
@media (prefers-color-scheme: dark) { :root:not(.light) { --ai-1: #f6a9b9; --ai-2: #f9a8d4; --ai-3: #c4b5fd; --ai-4: #93c5fd; --ai-tint: color-mix(in oklab, var(--ai-3) 10%, var(--card)); } }
:root.dark { --ai-1: #f6a9b9; --ai-2: #f9a8d4; --ai-3: #c4b5fd; --ai-4: #93c5fd; --ai-tint: color-mix(in oklab, var(--ai-3) 10%, var(--card)); }

/* Bordure dégradée sans élément enveloppant : deux fonds, padding-box et border-box */
@utility ai-border {
  border: 1.5px solid transparent;
  background: linear-gradient(var(--ai-bg, var(--card)), var(--ai-bg, var(--card))) padding-box,
              conic-gradient(from var(--ai-angle), var(--ai-stops)) border-box;
  @media (forced-colors: active) { border-color: CanvasText; background: Canvas; }
}
/* Lueur derrière l'élément, éteinte au repos */
@utility ai-glow {
  position: relative; isolation: isolate;
  &::before { content: ""; position: absolute; inset: -2px; z-index: -1; border-radius: inherit;
    background: conic-gradient(from var(--ai-angle), var(--ai-stops)); filter: blur(12px);
    opacity: 0; transition: opacity var(--dur-slow) var(--ease-out); pointer-events: none; }
  &:hover::before, &:focus-visible::before { opacity: .45; }
  &[data-busy]::before { opacity: .7; }
  &[data-done]::before { opacity: 0; transition-duration: 600ms; }
}
.ai-border[data-animate]:hover, .ai-border[data-animate]:focus-visible { animation: ai-spin 4s linear infinite; }
.ai-border[data-busy] { animation: ai-spin 1.6s linear infinite; }
.ai-border[data-offscreen] { animation-play-state: paused; }
@keyframes ai-spin { to { --ai-angle: 360deg; } }

/* Texte en dégradé : chaque arrêt ≥ 4,5:1 */
@utility ai-text {
  background: linear-gradient(90deg, var(--ai-1), var(--ai-2) 35%, var(--ai-3) 70%, var(--ai-4));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  @media (forced-colors: active) { color: CanvasText; background: none; }
}
/* « Campuss IA rédige… » : un reflet passe sur un gris lisible */
@utility ai-text-shimmer {
  background: linear-gradient(90deg, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%);
  background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: ai-sweep 1.6s linear infinite;
  @media (forced-colors: active) { color: CanvasText; background: none; animation: none; }
}
/* Squelette : gris traversé d'une lueur colorée légère */
@utility ai-skeleton {
  border-radius: var(--radius-sm); min-height: 0.875rem;
  background: linear-gradient(100deg, var(--muted) 30%, color-mix(in oklab, var(--ai-2) 14%, var(--muted)) 45%,
              color-mix(in oklab, var(--ai-3) 14%, var(--muted)) 55%, var(--muted) 70%);
  background-size: 220% 100%; animation: ai-sweep 1.6s linear infinite;
}
@keyframes ai-sweep { from { background-position: 200% 0; } to { background-position: -20% 0; } }
/* Surface de résultat */
@utility ai-surface { --ai-bg: var(--ai-tint); border-radius: var(--radius-xl); }

/* Mouvement réduit : dégradés statiques, boucles coupées */
@media (prefers-reduced-motion: reduce) { .ai-border, .ai-text-shimmer, .ai-skeleton { animation: none !important; } }
html.reduce-motion :is(.ai-border, .ai-text-shimmer, .ai-skeleton) { animation: none !important; }
```

### 7.4 Assemblage (composants communs, `src/components/ai/`)

- **`AiButton`** : `<Button variant="outline" className="ai-border ai-glow" data-animate>` + icône d'action + libellé `ai-text`. Prop `busy` → `data-busy`, `aria-busy`, libellé `ai-text-shimmer`. Remplace `.ai-button` et `.ai-button-inner` (deux éléments → un).
- **`AiBadge`** : `IconAi` 16 px + « Campuss IA » en `ai-text`, `text-xs font-semibold`.
- **`AiSurface`** : `<div className="ai-border ai-surface p-4">` + contenu en `--foreground` + pied `text-xs text-muted-foreground` « Généré par Campuss IA · à vérifier ».
- **`AiWorking`** : `AiSurface` `data-busy` + 3 `ai-skeleton` + libellé shimmer ; `aria-live="polite"`.
- **Entrée de question** (futur) : `ai-border` fixe, `ai-glow` au focus.
- **Étincelle** : `IconAi` qui tourne de 15° et grossit à 1,1 au survol (300 ms `--ease-back`, `motion-ok`).
- Le texte généré arrive par morceaux, chaque morceau en fondu 150 ms (jamais caractère par caractère).
- Mouvement réduit : bordure et texte en dégradé statiques, génération signalée par le libellé fixe et `aria-busy`.

---

## 8. Système d'animation

Objectif : « fini et vivant », beaucoup d'animations, toutes utiles : chaque animation répond à un geste, explique un changement d'état ou récompense. Aucune boucle décorative, sauf l'IA en travail.

### 8.1 Micro-interactions

| Élément | Déclencheur | Animation | Durée, courbe | Appareil | Mouvement réduit | Espace |
|---|---|---|---|---|---|---|
| Bouton | appui | `scale(.97)` + fond | 100 ms `--ease-out` | tous | fond seul | commun (`Button`) |
| Bouton en cours | envoi | icône → `Spinner`, largeur figée ; succès : `IconDone` 1,2 s puis retour | 150 ms fondu | tous | idem | commun |
| Carte de cours | survol / appui | −2 px + `shadow-sm`, image 1,03 / `scale(.985)` | 200 ms / 100 ms | survol : `hover-ok` | ombre seule | commun |
| Favori | clic | étoile `pop` + remplissage | 450 ms `--ease-back` | tous | remplissage seul | commun |
| Barre latérale | changement de page | l'indicateur actif glisse (`layoutId`) | ressort `snappy` | ≥ 1024 | instantané | commun |
| Barre d'onglets | sélection | pastille qui glisse, icône `scale .9 → 1`, libellé 600 | ressort `reward` | < 1024 | instantané | commun |
| Barres basses | défilement | se cachent vers le bas, reviennent vers le haut | 200 ms `--ease-out` | < 1024 | fondu | commun |
| Menu, popover | ouverture | `opacity` + `scale(.96 → 1)` depuis `var(--transform-origin)` (`data-starting-style` / `data-ending-style`) | 150 ms in / 100 ms out | tous | fondu | commun |
| Dialogue | ouverture | fond 200 ms ; panneau `scale(.97)` + fondu | 200 ms `--ease-out` | tous | fondu | commun |
| Feuille | ouverture | glisse depuis le bord ; glisser pour fermer (100 px ou 500 px/s) | 300 ms in / 200 ms out `--ease-drawer` | tous | fondu | commun |
| Onglets | changement | indicateur glisse ; contenu en fondu croisé | 200 ms | tous | fondu | commun |
| Liste | premier affichage | `rise` en cascade | 300 ms + 30 ms/élément, 8 max | tous | fondu | tous |
| Liste | tri, filtre | fondu croisé du contenu (pas de réordonnancement animé, rien ne saute sous le doigt) | 150 ms | tous | idem | tous |
| Squelette → contenu | chargement | fondu croisé | 200 ms | tous | idem | tous |
| Champ | erreur | `shake` + message qui se déplie (`interpolate-size`) | 320 ms | tous | message seul | commun |
| Enregistrement auto | frappe | point qui pulse, puis `IconDone` « Enregistré » en fondu | 150 ms | tous | fondu | commun |
| Toast | apparition | Sonner (translation + fondu) | ≈ 400 ms | tous | fondu | commun |
| Barre de chargement de page | navigation | `.nav-progress` (existant) | 200 ms puis 2,4 s | tous | idem | commun |
| `CreateSheet` | + | feuille + entrées en cascade de 30 ms | 300 ms | tous | fondu | commun |
| Palette ⌘K | ouverture | `opacity` + `scale(.98 → 1)`, pas de cascade sur les résultats | 150 ms | tous | fondu | parcours |
| Carte du jour | arrivée | `rise` ; anneau de progression qui se remplit | 300 ms ; 600 ms | tous | instantané | parcours |
| Vote de demande | clic | chiffre qui roule, pouce `pop` | 200 ms | tous | chiffre seul | parcours |
| « Bien démarrer » | étape faite | coche tracée (`stroke-dashoffset`), barre qui avance ; liste complète : sortie en fondu + badge | 300 ms | tous | instantané | parcours |
| Astuce en contexte | première fois | `Popover` qui `rise` | 200 ms | tous | fondu | parcours |
| Sommaire | apparition d'une note | liste → rail à tirets (fondu + `scaleX`) ; **le texte ne bouge pas** | 200 ms `--ease-in-out` | `fine` | fondu | lecture |
| Note en marge | clic | `.ann-glow` sur le passage | 1,4 s | tous | contour fixe | lecture |
| Menu « / » | ouverture, navigation | `scale(.97 → 1)` depuis le curseur ; fond de sélection qui glisse (`layoutId`) | 120 ms ; 100 ms | `fine` | fondu | lecture |
| Poignée de bloc | survol du bloc | opacité 0 → .5 → 1 | 120 ms | `fine` | idem | lecture |
| Lecture | défilement | barre de progression `animation-timeline: scroll(root)` ; en-tête qui prend `shadow-sm` | lié au défilement | tous | statique | lecture |
| Tuiles « Commencer avec… » | première frappe | disparaissent | 150 ms fondu | tous | idem | imports |
| Décision de modération | A / R | l'élément suivant glisse en place ; compteur qui décroît | 160 ms | tous | instantané | contribution, admin |
| Actions groupées | sélection | barre qui monte de 12 px + fondu | 180 ms `--ease-out` | tous | fondu | admin, contribution |
| Ligne modifiée | action admin | fond `primary/8` qui s'estompe | 1,2 s | tous | changement net puis retour 300 ms | admin |
| Panneau de fiche | ouverture | glisse depuis la droite | 220 ms in / 160 ms out `--ease-drawer` | ≥ 768 | fondu | admin |
| Fiche de révision | toucher, `Espace` | retournement `rotateY` | 400 ms | tous | fondu 120 ms | réviser |
| Fiche de révision | glisser | suit le doigt, rotation ≤ 8°, teinte succès/attention proportionnelle ; seuil 35 % ou 500 px/s | ressort `sheet` | `coarse` | boutons seuls | réviser |
| Réponse juste / fausse | choix | contour succès + coche tracée / `shake` 4 px × 2 + révélation | 150 ms / 200 ms | tous | couleur + icône + mot | réviser |
| Anneau d'objectif | arrivée, progrès | `stroke-dashoffset` | 600 ms `--ease-out` | tous | instantané | réviser |
| Flamme de série | +1 jour | `scale 1 → 1.25 → 1`, chiffre qui roule | ressort `reward` ≈ 350 ms | tous | chiffre seul | réviser |
| Quête cochée | fin de quête | trait qui barre, la ligne descend | 250 ms | tous | instantané | réviser |
| Badge | obtention | reflet qui traverse (`.trophy`), `pop` | 900 ms | tous | fondu | profil |
| Aperçu de profil | changement de style | fondu croisé de la carte d'aperçu | 200 ms | ≥ 1024 | idem | profil |
| Paramètres (téléphone) | sous-page | glissement horizontal | 220 ms | < 768 | fondu | profil |
| Présentation | défilement | `.lp-reveal` CSS (`animation-timeline: view()`) | entrée 0 à 35 % | tous | aucun | présentation |

### 8.2 Récompenses

- Gain de crédits : le compteur roule ses chiffres ; si le compteur n'est pas visible (téléphone), toast compact `IconCredits` « +5 crédits ». La pastille « +5 » qui vole vers le compteur (FLIP, 600 ms) est en bonus.
- Fin de quiz : anneau de score (700 ms) et chiffre qui défile (800 ms).
- Confettis : `canvas-confetti` chargé à la demande (`import()`), option `disableForReducedMotion: true`, 1,2 s au plus. Déclencheurs : objectif du jour atteint, quiz ≥ 80 % ou record, palier de série (7, 30, 100), badge obtenu. **Une seule célébration par jour** (`lib/celebrate.ts`, clé locale par compte), fermable, jamais bloquante, jamais sur un écran de travail.
- Vibration de 10 ms sur Android (`navigator.vibrate`), coupée avec les sons.
- Sons : 3 sons courts auto-hébergés, coupés par défaut.

### 8.3 Glisser au téléphone

| Geste | Où | Alternative obligatoire (WCAG 2.5.1) |
|---|---|---|
| Glisser vers le bas pour fermer | feuilles basses | bouton fermer, Échap, retour système |
| Glisser gauche/droite | fiches de révision (droite = Bien, gauche = Raté), seulement une fois la réponse vue ; coupé en mouvement réduit | les 4 boutons restent visibles, avec l'intervalle suivant ; clavier : Espace, 1-4, Z, E, M, ? (`lib/session-keys.ts`) |
| Glisser une demande d'ami (accepter) | Amis | boutons |
| Interdit | décisions de modération, actions admin, archivage d'un document, changement S1/S2, bord gauche | sans objet |

`motion` : `drag="y"`, `dragConstraints={{ top: 0 }}`, `dragElastic={0.2}` ; `touch-action: pan-y` sur les fiches.

### 8.4 View Transitions

`react` 19.3 exporte `ViewTransition` et `addTransitionType` ; `next/link` accepte `transitionTypes`. Aucun drapeau `viewTransition` n'existe dans next 16.4.3 : prototype seulement ; **rien d'indispensable n'en dépend** (amélioration progressive, iOS 18+).

- Zone principale enveloppée dans `<ViewTransition enter={{ "nav-forward": "slide-forward", "nav-back": "slide-back", default: "fade" }} exit={…} default="none">`. Barre latérale, barre d'onglets et en-tête ont leur propre `view-transition-name` et ne bougent pas.
- `/d/[id]` et `/editer/[id]` : **fondu seul** (un glissement remonte BlockNote et la couche d'annotations et casse la restauration du défilement). Sur `/d/[id]`, le titre peut se partager avec la carte (`name="doc-<id>"`, `share="morph"`, 450 ms) ; jamais sur `/editer`.
- Rien ne joue si `event.hasUAVisualTransition` est vrai (geste retour iOS).
- Jamais sur une liste de plus de 50 éléments ; jamais plus de 300 ms (l'interface est figée pendant la capture).

```css
::view-transition-old(.slide-forward) { animation: var(--dur-fast) var(--ease-in) both vt-out-left; }
::view-transition-new(.slide-forward) { animation: var(--dur-slow) var(--ease-out) both vt-in-right; }
::view-transition-old(.slide-back) { animation: var(--dur-fast) var(--ease-in) both vt-out-right; }
::view-transition-new(.slide-back) { animation: var(--dur-slow) var(--ease-out) both vt-in-left; }
::view-transition-old(.fade) { animation: var(--dur-fast) var(--ease-in) both vt-fade-out; }
::view-transition-new(.fade) { animation: var(--dur-base) var(--ease-out) both vt-fade-in; }
::view-transition-group(.morph) { animation-duration: var(--dur-reward); animation-timing-function: var(--ease-in-out); }
@keyframes vt-in-right { from { opacity: 0; transform: translateX(calc(24px * var(--motion))); } }
@keyframes vt-in-left { from { opacity: 0; transform: translateX(calc(-24px * var(--motion))); } }
@keyframes vt-out-left { to { opacity: 0; transform: translateX(calc(-12px * var(--motion))); } }
@keyframes vt-out-right { to { opacity: 0; transform: translateX(calc(12px * var(--motion))); } }
@keyframes vt-fade-in { from { opacity: 0; } }
@keyframes vt-fade-out { to { opacity: 0; } }
```

### 8.5 Budget

Une seule animation infinie décorative à l'écran (l'IA en travail). Pas de `will-change` permanent. Animer `--ai-angle` repeint à chaque image : survol et travail seulement. `canvas-confetti`, `pdfjs-dist`, TanStack Table chargés à la demande. Carte de chaleur rendue en SVG côté serveur.

### 8.6 Mouvement réduit

La règle actuelle (toutes les durées à 0,01 ms) est **retirée** : elle coupe aussi les fondus, qui ne gênent pas (WCAG 2.3.3 vise le mouvement) et ne neutralise pas les animations liées au défilement.

```css
@media (prefers-reduced-motion: reduce) { :root { --motion: 0; } }
html.reduce-motion { --motion: 0; }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: var(--dur-fast) !important; }
}
html.reduce-motion ::view-transition-group(*), html.reduce-motion ::view-transition-old(*), html.reduce-motion ::view-transition-new(*) { animation-duration: var(--dur-fast) !important; }
```

Avec `--motion: 0`, les keyframes du site deviennent des fondus. Les transformations de survol passent par `motion-ok:`. Boucles, rotations, confettis, parallaxe, ressorts : coupés. `MotionConfig reducedMotion="user"` (déjà monté dans `components/motion.tsx`) fait de même côté `motion`. Les animations liées au défilement sont sous `motion-ok` ou `@media (prefers-reduced-motion: no-preference)` + `html:not(.reduce-motion)`.

---

## 9. Lecture, dyslexie et réglages de lecture

### 9.1 Diagnostic

OpenDyslexic est environ 70 % plus large que Source Sans 3 (mesuré sur une phrase de cours) même ramenée à la même hauteur d'x : aucune compensation ne la fait tenir dans une interface dessinée pour Source Sans 3. Le mode actuel la met partout (barre latérale tronquée, boutons `h-9 whitespace-nowrap` qui coupent, graisses 600/650 qui tombent sur le gras 700), et `overflow-wrap:anywhere` coupe les mots n'importe où. Ce qui aide de façon mesurée : l'espacement des lettres, une police sans empattement droite, une ligne courte, un interligne ≥ 1,5, pas d'italique, un fond non blanc.

### 9.2 Réglages (préférences `users.prefs`, cookie `campuss-prefs` pour les visiteurs)

| Clé | Valeurs | Défaut | Portée |
|---|---|---|---|
| `readingFont` | `"source"` · `"atkinson"` · `"serif"` · `"od"` | `"source"` | zones de lecture (cours, éditeur, fiches, quiz) |
| `readingAll` | `true` | absent | applique la police de lecture à toute l'interface (ignoré pour `od`) |
| `spacing` | `"wide"` · `"wider"` | absent (normal) | zones de lecture |
| `readingWidth` | `"narrow"` | absent (normale) | `--measure` |
| `noItalic` | `true` | absent | zones de lecture |
| `paper` | `true` | absent | fond crème des zones de lecture |
| `textSize` | `"s"` · `"l"` · `"xl"` | absent (16 px) | toute l'interface (existant) |

Polices : Source Sans 3 (défaut), **Atkinson Hyperlegible Next** (recommandée en mode adapté, OFL), Source Serif 4 (lecture longue, OFL), OpenDyslexic (**texte des cours seulement**).
Migration : les comptes `dyslexic: true` passent à `readingFont: "atkinson"` + `spacing: "wide"` (migration SQL) ; la clé `dyslexic` est ignorée ensuite.
Le bouton « Aa » (`ReadingSettings`) est sur la page d'un cours, dans le pied des pages publiques et dans Paramètres › Affichage, avec un aperçu en direct sur un paragraphe de cours.

### 9.3 Chargement des polices

Toutes auto-hébergées dans `fonts/` (OFL, fichier de licence à côté). `next/font/local` (`src/app/fonts.ts`) si faisable : Massilia et Source Sans 3 préchargées (`preload: true`, `adjustFontFallback`), Atkinson Hyperlegible Next, Source Serif 4 et OpenDyslexic avec `preload: false`, chacune exposée par une variable CSS (`variable: "--font-atkinson"`…) et les descripteurs de compensation passés par `declarations`. Si `next/font/local` refuse (chemin hors de `src`, `declarations`, Turbopack), garder `@font-face` dans `src/app/fonts.css` avec les mêmes descripteurs.

**Compensation** : `size-adjust` = hauteur d'x de Source Sans 3 (0,478 em, mesurée) / hauteur d'x de la police ; `ascent-override` = 1,024 / size-adjust ; `descent-override` = 0,400 / size-adjust ; `line-gap-override: 0%`. Valeurs mesurées avec fontTools sur les fichiers réels (hauteur d'x : Source Sans 3 0,478 ; Atkinson Hyperlegible Next 0,496 ; Source Serif 4 0,492 ; OpenDyslexic 0,560). `next/font/local` n'est pas utilisé (il renomme les familles que BlockNote et les réglages désignent par leur nom) : tout est dans `src/app/fonts.css`, latin et latin-ext, romain et italique.

```css
/* OpenDyslexic : graisses déclarées en plages, pour que 500/600 ne tombent jamais sur un gras synthétique ou plus large */
@font-face { font-family: "OpenDyslexic"; src: url("../../fonts/opendyslexic/OpenDyslexic-Regular.woff2") format("woff2");
  font-weight: 100 549; font-style: normal; font-display: swap;
  size-adjust: 85.4%; ascent-override: 120%; descent-override: 46.9%; line-gap-override: 0%; }
@font-face { font-family: "OpenDyslexic"; src: url("../../fonts/opendyslexic/OpenDyslexic-Bold.woff2") format("woff2");
  font-weight: 550 900; font-style: normal; font-display: swap;
  size-adjust: 85.4%; ascent-override: 120%; descent-override: 46.9%; line-gap-override: 0%; }
/* idem Italic (100 549) et BoldItalic (550 900) */

/* Atkinson Hyperlegible Next, variable 200-800 (fonts/atkinson-hyperlegible-next/, OFL) */
@font-face { font-family: "Atkinson Hyperlegible Next"; src: url("../../fonts/atkinson-hyperlegible-next/atkinson-hyperlegible-next-latin-wght-normal.woff2") format("woff2");
  font-weight: 200 800; font-style: normal; font-display: swap;
  size-adjust: 96.4%; ascent-override: 106.3%; descent-override: 41.5%; line-gap-override: 0%; }

/* Source Serif 4, variable (fonts/source-serif-4/, OFL) */
@font-face { font-family: "Source Serif 4"; src: url("../../fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2") format("woff2");
  font-weight: 200 900; font-style: normal; font-display: swap;
  size-adjust: 97.2%; ascent-override: 105.4%; descent-override: 41.2%; line-gap-override: 0%; }
```

### 9.4 CSS exact (`src/styles/reading-prefs.css`)

```css
:root {
  --font-text: "Source Sans 3";
  --font-read: var(--font-text);
  --read-size: 1.125rem; --read-leading: 1.7; --read-tracking: normal; --read-word: normal; --read-gap: 0.9em;
}
html { font-synthesis: none; }
html.read-atkinson { --font-read: "Atkinson Hyperlegible Next"; }
html.read-serif { --font-read: "Source Serif 4"; }
html.read-od { --font-read: "OpenDyslexic"; --read-leading: 1.8; }
/* Toute l'interface : jamais avec OpenDyslexic */
html.read-all:not(.read-od) { --font-text: var(--font-read); }

/* Zones de lecture : le cours, l'éditeur, les fiches, les quiz */
:is(.course, .doc-editor .bn-editor, [data-reading]) {
  font-family: var(--font-read), "Source Sans 3", ui-sans-serif, sans-serif;
  font-size: var(--read-size); line-height: var(--read-leading);
  letter-spacing: var(--read-tracking); word-spacing: var(--read-word);
  overflow-wrap: break-word; hyphens: manual; text-align: start;
}
.course > * + * { margin-top: var(--read-gap); }

/* Espacement : « aéré » puis les valeurs de test de WCAG 1.4.12 */
html.spacing-wide  { --read-tracking: 0.03em; --read-word: 0.08em; --read-leading: 1.85; --read-gap: 1.3em; }
html.spacing-wider { --read-tracking: 0.12em; --read-word: 0.16em; --read-leading: 2;    --read-gap: 2em; }
html.read-od.spacing-wider { --read-tracking: 0.06em; }

html.measure-narrow { --measure: 30rem; }

/* Sans italique : l'emphase passe en gras */
html.no-italic :is(.course, .doc-editor .bn-editor, [data-reading]) :is(em, i, .ann-italic) { font-style: normal; font-weight: 600; }

/* Fond crème */
html.paper-cream { --paper: #fbf6e9; }
@media (prefers-color-scheme: dark) { html.paper-cream:not(.light) { --paper: #1f1b16; } }
html.dark.paper-cream { --paper: #1f1b16; }
:is(.course, .doc-editor) { background: var(--paper); }

/* Interface dans une autre police : rien n'est tronqué, tout peut passer à la ligne */
html.read-all :is([data-slot=sidebar-menu-button], [data-slot=badge], [data-slot=tabs-trigger], [data-slot=button]) { white-space: normal; height: auto; min-height: 2.25rem; }
html.read-all [data-slot=sidebar-menu-button] .truncate { overflow: visible; text-overflow: clip; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
```

`prefClasses(prefs)` produit : `light|dark`, `text-s|l|xl`, `read-atkinson|read-serif|read-od`, `read-all`, `spacing-wide|wider`, `measure-narrow`, `no-italic`, `paper-cream`, `reduce-motion`, `compact`, `accent-<clé>`, `hide-game`, `others-plain|others-off`, `fixed-bars`.

Accompagnement dans les composants (améliore aussi le zoom à 200 %, WCAG 1.4.4 et 1.4.10) : `Button` en `min-h`, libellés de navigation sur 2 lignes (`line-clamp-2`), plus aucun `overflow-wrap:anywhere`, titres de cartes en `hyphens:auto` hors police de lecture.

Non-régression : un test e2e vérifie qu'aucun `[data-slot=button]` n'a `scrollWidth > clientWidth` sur l'accueil, un cours, l'éditeur et les paramètres, avec `readingFont: "atkinson"` + `readingAll` + `spacing: "wider"`.

---

## 10. Personnalisation (garde-fous visuels)

Le confort et l'accessibilité ne se débloquent jamais. Seule l'identité visible par les autres se gagne (seuils, jamais d'achat).

- Polices de nom (6, latines seulement, compensées comme au §9.3) : Massilia, Source Serif 4, JetBrains Mono, Caveat, Nunito, Barlow Condensed. Chargées seulement là où un style riche s'affiche (profil, en-tête de profil, fiche ami, ligue, classement) ; jamais dans les listes denses. En police de lecture adaptée (`readingFont` ≠ `source`), les noms des autres passent dans la police de lecture.
- Couleurs et dégradés : §2.6. Effets (reflet sur le nom, lueur du cadre) : en boucle lente et douce (reflet : un passage de 1,5 s toutes les 5 s ; lueur : une respiration de 4 s), jamais de clignotement, coupés en mouvement réduit **chez le spectateur** (et le reflet dans les listes du téléphone).
- Bannières : dégradés et motifs de la liste ; image seulement si `features.bannerImages` (activé par défaut), passée par `cleanImage`, signalable, réinitialisable par un modérateur.
- Réglage « Styles des autres » : affichés · sobres (couleur seule) · masqués. « Sobres » par défaut au téléphone dans les listes.
- Noms : pas de caractères combinants empilés, invisibles ou de lettres mathématiques Unicode ; 80 caractères.

---

## 11. Écriture

PUI « Use plain and simple language », « Use sentence case », « Use numerals for numbers », « Avoid full stops if possible », « Ensure button text describes the action », « Avoid using “my” ».

1. **N'écris pas ce que l'écran montre déjà.** Pas de « Cliquez sur le bouton ci-dessous », pas de chapeau qui répète le titre, pas de mode d'emploi permanent (une astuce ponctuelle suffit).
2. **Un bouton = un verbe** : « Publier », « Ajouter un ami », « Générer un quiz ». Jamais « OK », « Valider », « Soumettre ».
3. **Tutoiement** (sauf pages légales), phrases courtes, casse de phrase, chiffres en chiffres (« 3 cours »).
4. **Pas de point final** dans un libellé, un toast, un titre ; un point dans un paragraphe.
5. **Erreurs** : ce qui s'est passé + comment réparer, sous le champ : « Ce code ne correspond à aucun ami » et non « Erreur 404 ».
6. **États vides** : une phrase + une action : « Aucun favori ici » + « Retirer le filtre ».
7. **Données sans étiquette** : « 12 lecteurs », « Mis à jour hier ».
8. **Typographie française** : espace fine insécable (U+202F) avant ; : ! ?, guillemets « », apostrophe ’, points de suspension …, dates courtes « 3 nov. », espace fine dans les milliers (« 1 240 »).
9. **IA** : « Campuss IA rédige… », « Généré par Campuss IA · à vérifier ».
10. **Pas de « mes »** dans les libellés de navigation, sauf « Mes documents » (gardé pour l'auteur).

Lexique (un mot par concept, partout) :

| Concept | Mot | Pas |
|---|---|---|
| onglet des matières | Matières | Cours, Mes cours |
| page d'accueil connectée | Accueil | Mes cours |
| file des délégués | À valider | À traiter (réservé à l'admin) |
| tableau de l'admin | À traiter | Tableau de bord |
| comptes en admin | Personnes | Comptes, Utilisateurs |
| réviser avec d'autres | Ensemble (onglet), Réviser à plusieurs (action) | Réviser ensemble, Groupes |
| documents de l'auteur | Mes documents | Contribuer |
| cours renvoyé | À corriger | Refusé |
| réglages | Paramètres | Réglages du compte, Mon compte |
| création | Nouveau (ordinateur), + (téléphone) | Ajouter un document |

Avant / après :

| Avant | Après |
|---|---|
| « Saison en cours : Automne 2026, jusqu'au 31 janvier. Le classement repart de zéro à chaque saison, et y figurer reste un choix. » | « Saison d'automne · jusqu'au 31 janv. » |
| « Rien pour l'instant » sur chaque matière | carte atténuée, « 0 cours » |
| « Tu as de bonnes notes ? Partage-les. » | le + suffit |
| « Pour réviser à plusieurs, ajoute des amis sur la page Amis » | ton code + champ « Code d'un ami » sur place |
| « Sélectionne du texte pour surligner, mettre en gras ou ajouter une note » (permanent) | astuce unique au premier cours : « Sélectionne du texte pour l'annoter » |
| « Demander un accès » | « Créer mon compte » |

---

## 12. Interdits

- Métaphore décorative, décor sans fonction, bandeau de couleur selon le mode, titre Massilia au-delà de `.display`.
- CSS maison quand un composant shadcn ou ReUI existe ; tableau en cartes par CSS ; `select` natif dans l'interface connectée ; champ date natif.
- Supercons, import direct depuis `@hugeicons/core-free-icons` hors de `lib/icons.ts`, `lucide-react` hors des artefacts utilisateurs (`lib/content.ts`).
- Couleur en dur dans un composant ; texte en `text-primary` en sombre ; gris sur fond coloré.
- Dégradé, lueur ou ombre colorée hors IA ; plus d'une bordure IA animée à l'écran ; texte généré en dégradé.
- Plus d'un bouton plein par écran ; bouton désactivé sans explication ; « Valider » ou « Enregistrer » en plus d'un enregistrement automatique ; formulaire avant d'écrire.
- Confirmation pour une action réversible (toast « Annuler » à la place).
- Liste des inscrits, annuaire, suggestions d'inconnus, présence « en ligne » imposée.
- Burger au téléphone ; second bouton flottant à côté du + ; geste comme seul moyen d'agir ; capture du bord gauche ; glisser pour une décision.
- Animation en boucle décorative, chiffres qui défilent sur un écran de travail, plus d'une célébration par jour, perte ou culpabilisation dans le jeu.
- `overflow-wrap:anywhere`, hauteur fixe sur un bouton, `100vh`, `will-change` permanent.
- OpenDyslexic hors du texte des cours ; police de nom dans une liste dense.
- Texte bavard : chapeau qui répète le titre, mode d'emploi permanent, explication de l'évident.
- Service externe sans repli quand il n'est pas configuré ; fonction coupée affichée grisée (elle disparaît).
