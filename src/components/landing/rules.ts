/** Règles pures de la page de présentation (testées dans tests/presentation.test.ts). */

/** Seuils sous lesquels un chiffre n'est pas montré : un « 12 étudiants » dessert plus qu'il ne prouve. */
export const PROOF_THRESHOLDS = { documents: 30, subjects: 6, cards: 200, thanks: 50, students: 50 } as const;

/** Arrondi vers le bas, pour ne jamais gonfler : 12 → 12, 47 → 40, 349 → 300, 1 249 → 1 200. */
export function roundDown(n: number) {
  if (n < 20) return n;
  const step = n < 100 ? 10 : n < 1000 ? 50 : 100;
  return Math.floor(n / step) * step;
}

/** `more` : le chiffre réel dépasse la valeur montrée (« 40+ »). */
export type Proof = { key: keyof typeof PROOF_THRESHOLDS; value: number; more: boolean; label: string };

/** Garde les chiffres au-dessus de leur seuil, arrondis vers le bas, dans l'ordre donné. */
export function proofsOf(raw: Record<keyof typeof PROOF_THRESHOLDS, number>): Proof[] {
  const labels: Record<keyof typeof PROOF_THRESHOLDS, string> = {
    documents: "cours publiés", subjects: "matières couvertes", cards: "fiches révisées ce mois-ci", thanks: "mercis envoyés", students: "étudiants inscrits",
  };
  return (Object.keys(labels) as (keyof typeof PROOF_THRESHOLDS)[])
    .filter((key) => raw[key] >= PROOF_THRESHOLDS[key])
    .map((key) => ({ key, value: roundDown(raw[key]), more: roundDown(raw[key]) < raw[key], label: labels[key] }));
}

/** Nom lisible du fournisseur d'IA d'après l'hôte de AI_BASE_URL, avec l'hôte en toutes lettres. */
export function aiProvider(baseUrl: string) {
  let host = "";
  try { host = new URL(baseUrl).hostname; } catch { return { name: "notre fournisseur d’IA", host: "" }; }
  const known: [RegExp, string][] = [
    [/(^|\.)googleapis\.com$/, "Google (Gemini)"], [/(^|\.)mistral\.ai$/, "Mistral AI"], [/(^|\.)openai\.com$/, "OpenAI"],
    [/(^|\.)scaleway\.com$/, "Scaleway"], [/(^|\.)ovh\.net$/, "OVHcloud"],
  ];
  return { name: known.find(([re]) => re.test(host))?.[1] ?? host, host };
}
