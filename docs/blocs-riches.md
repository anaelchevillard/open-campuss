# Blocs riches des cours

Les cours s’écrivent dans l’éditeur (BlockNote) et sont enregistrés en Markdown Campuss. Chaque bloc riche a un format
Markdown, le même pour l’éditeur, l’import d’un fichier `.md` (ou d’un export Notion/Obsidian) et la lecture.
Le serveur ne croit jamais le navigateur : les blocs sont refiltrés (`sanitizeBlocks`) et le Markdown recalculé.

## Artefact HTML

```
::artifact{src="/files/<uuid>" entry="index.html" title="Simulation de l'offre" display="bloc"}
```

- Insertion : menu « / » › Artefact HTML. Coller le code (HTML, composant React JSX/TSX, Markdown) ou choisir un fichier
  `.html`, `.jsx`, `.tsx`, `.md` (2 Mo) ou `.zip` (10 Mo, 500 fichiers, 40 Mo décompressés). Même chemin que
  « Coller un artefact » (`pageFromText`, `chooseEntry`, `safeRelativePath`), quota d’espace, 30 envois par heure,
  analyse antivirus (le fichier reste illisible tant qu’elle n’est pas faite). Pas d’artefact dans une proposition de
  modification.
- `src` : un fichier du cours (`doc_files`, nom `artefact.html` ou `artefact.zip`, `embedded`). Toute autre adresse est
  refusée ; `entry` est un chemin relatif sûr vers une page `.html`.
- `display` : `bloc` (hauteur annoncée par la page, bornée entre 120 et 4 000 px) ou `page` (la « page HTML du cours »,
  à hauteur d’écran).
- Rendu : iframe de l’origine de contenu `CONTENT_ORIGIN/embed/<jeton>/<fichier>/<entrée>` (jeton signé et daté, comme
  `/view` ; droit de lecture revérifié ; le fichier doit appartenir au document du jeton). Bac à sable
  `allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads`, jamais `allow-same-origin`.
  CSP : `default-src 'none'`, scripts de la page et de `/vendor` seulement, `connect-src 'none'`, `form-action 'none'`,
  `frame-src 'none'`, `frame-ancestors` = le site. `/embed` n’est servi que par l’origine de contenu (proxy).
- Plein écran sur le cadre ; à l’impression et dans le PDF officiel, un encadré « Contenu interactif … ».
- Pièce jointe : un étudiant peut joindre une page `.html` (5 Mo, texte) ; `/files` la donne toujours en
  téléchargement binaire (`application/octet-stream`, `attachment`), elle ne s’exécute jamais sur le site.

## Graphique Vega-Lite

````
```vega-lite
{ "data": { "values": [{ "a": "A", "b": 28 }] }, "mark": "bar",
  "encoding": { "x": { "field": "a", "type": "nominal" }, "y": { "field": "b", "type": "quantitative" } } }
```
````

- JSON uniquement, 200 000 caractères, 5 000 lignes de données. Refusés partout : la clé `url` (données, images),
  `href`, `$ref`, `loader`, `usermeta`, toute valeur commençant par `http(s)://` ou `//` (`lib/rich/vega.ts`).
- Rendu dans le navigateur par vega-embed, chargé à la demande : SVG, `ast: true` + `vega-interpreter` (aucun eval, la
  CSP de la page reste sans `unsafe-eval`), chargeur qui refuse toute requête, pas de menu d’export.

## Figure TikZ

````
```tikz
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}
  \draw[-Stealth] (0,0) -- (2,1) node[right] {$v$};
\end{tikzpicture}
```
````

- 20 000 caractères. Refusés : `\write18`, `\immediate`, `\openout`, `\openin`, `\read`, `\input`, `\include`,
  `\catcode`, `\csname`, `\special`, `\directlua` et les paquets absents de TikZJax.
- Rendu côté serveur par le moteur TeX de TikZJax (WebAssembly, `node-tikzjax`), dans un fil `worker_threads` neuf,
  coupé après 8 s, mémoire bornée, une figure à la fois ; aucun disque ni shell (système de fichiers en mémoire).
  Le SVG obtenu passe par le même nettoyage que les SVG d’auteur, puis est gardé en cache (`rich/tikz/<sha256>.svg`) :
  un lecteur ne déclenche jamais de calcul pour une figure déjà vue. Une figure pas encore en cache est demandée à
  `POST /api/rich/tikz` (compte connecté, 60 rendus par heure).
- Polices Computer Modern auto-hébergées (`/vendor/tikz/fonts.css`), chargées seulement avec une figure.
- Construction : `scripts/build-tikz.mjs` (fil `tikz-worker.mjs`, fichiers `tikz/tex`, polices) ; copiés dans l’image.

## Graphe de fonctions

````
```plot
y = sin(x)
y = x^2/4 - 1
x: -6 .. 6
y: -3 .. 3
```
````

- 6 fonctions de x au plus. Parseur maison (`lib/rich/plot.ts`) : nombres, `x`, `pi`, `e`, `+ - * / ^`, multiplication
  implicite (`2x`), parenthèses, et `sin cos tan asin acos atan sinh cosh tanh exp ln log log2 sqrt abs floor ceil round
  sign min max`. L’expression devient un arbre de fonctions : jamais d’eval ni de `new Function`.
- Interactif avec Mafs (déplacer, zoomer), chargé à la demande ; tracé SVG statique pour l’impression et le PDF.

## Figure SVG

````
```svg-figure
<svg viewBox="0 0 200 100"><circle cx="50" cy="50" r="40" fill="#f97316"/></svg>
```
````

- Un seul élément `<svg>`, 400 000 caractères. Nettoyé côté serveur par liste blanche sur l’arbre hast
  (`lib/rich/svg.ts`) : éléments de dessin et de texte seulement (ni `script`, ni `foreignObject`, ni `image`, ni `a`),
  aucun attribut `on*`, liens limités à `#identifiant`, `url()` limité à `#identifiant`, pas d’`@import`. Les
  identifiants reçoivent un préfixe propre à la figure. Rendu en éléments React, jamais en HTML brut.
- Dans l’éditeur, l’aperçu est une image (`<img src="data:image/svg+xml…">`), inerte par nature.
- Un bloc de code `svg` reste du code : seul `svg-figure` devient une figure.

## HTML

Le HTML passe uniquement par le bloc artefact : il n’est jamais inséré dans la page.
