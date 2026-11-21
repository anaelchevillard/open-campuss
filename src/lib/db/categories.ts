export const CATEGORIES = {
  cours: "Cours (CM)", fiche: "Fiche", td: "TD corrigé", partiel: "Partiel", projet: "Projet",
} as const;

// Le tag court affiché sur les cartes
export const CATEGORY_TAGS = { cours: "CM", fiche: "Fiche", td: "TD", partiel: "Partiel", projet: "Projet" } as const;

export const KINDS: Record<string, string> = {
  none: "Fichiers", editor: "Cours rédigé", html: "Page", artifact: "Artefact", markdown: "Page", site: "Site", notion: "Notion",
};

export const CATEGORY_PLURALS = { cours: "Cours", fiche: "Fiches", td: "TD corrigés", partiel: "Partiels", projet: "Projets" } as const;

export const LEVELS = [1, 2, 3] as const;
export const levelLabel = (level: number) => `L${level}`;

export const RIGHTS = {
  own_notes: "Mes propres notes, reformulées avec mes mots",
  own_work: "Mon travail personnel (projet, exercices, fiche originale)",
  authorized: "Document d’un enseignant, partagé avec son accord écrit",
  public: "Document rendu public par son auteur ou l’université",
} as const;
export type RightsBasis = keyof typeof RIGHTS;
export const RIGHTS_SHORT: Record<string, string> = {
  own_notes: "Notes personnelles d’étudiant", own_work: "Travail personnel d’étudiant",
  authorized: "Partagé avec l’accord de l’enseignant", public: "Document public",
};
export const TERMS_VERSION = "2026-11b";
export const RIGHTS_FOR_EXAMS: RightsBasis[] = ["authorized", "public"];
