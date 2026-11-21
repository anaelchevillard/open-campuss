/** Règles pures de l'écoute d'un cours (testées sans navigateur). */

/** Au-delà, certains navigateurs coupent la synthèse vocale en pleine phrase. */
export const MAX_CHUNK = 220;
export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export type Chunk = { text: string; block: number };

/** Découpe chaque bloc du cours en morceaux courts, aux fins de phrase quand c'est possible. */
export function podcastChunks(blocks: string[], max = MAX_CHUNK): Chunk[] {
  const out: Chunk[] = [];
  blocks.forEach((raw, block) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return;
    const sentences = text.match(/[^.!?…;:]+[.!?…;:]*\s*/g) ?? [text];
    let current = "";
    const push = () => { if (current.trim()) out.push({ text: current.trim(), block }); current = ""; };
    for (const sentence of sentences) {
      if (current && (current + sentence).length > max) push();
      if (sentence.length <= max) { current += sentence; continue; }
      // Une phrase trop longue se coupe entre deux mots
      for (const word of sentence.split(" ")) {
        if (current && (current + word).length + 1 > max) push();
        current += `${word} `;
      }
    }
    push();
  });
  return out;
}

/** Vitesse suivante, en boucle. */
export const nextSpeed = (rate: number) => SPEEDS[(SPEEDS.indexOf(rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];

/** La voix française la plus naturelle disponible : fr-FR d'abord, puis toute voix française. */
export function pickFrenchVoice<T extends { lang: string; localService?: boolean; name: string }>(voices: T[]): T | undefined {
  const french = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("fr"));
  const score = (v: T) => (v.lang.toLowerCase().replace("_", "-") === "fr-fr" ? 4 : 0) + (/natural|premium|enhanced|google/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  return [...french].sort((a, b) => score(b) - score(a))[0];
}
