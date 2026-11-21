export function courseTemplate(category: string) {
  if (category === "partiel") return "## Sujet\n\n\n\n## Corrigé\n\n";
  if (category === "td") return "## Énoncé\n\n\n\n## Correction\n\n\n\n## Méthode à retenir\n\n";
  if (category === "fiche") return "## À retenir\n\n\n\n## Définitions\n\n\n\n## Formules\n\n";
  return "## Introduction\n\n\n\n## Partie 1\n\n\n\n## À retenir\n\n";
}
