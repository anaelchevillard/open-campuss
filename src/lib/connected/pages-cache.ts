import "server-only";
import { TtlCache } from "../ttl-cache";
import type { PickedPage } from "./providers";
import type { Provider } from "./rules";

// 60 s : taper dans la recherche ou rouvrir le sélecteur ne rappelle pas le service à chaque fois.
// « Déjà importé » n'est pas gardé ici : il se lit en base à chaque réponse.
const globals = globalThis as unknown as { campusPickerCache?: TtlCache<PickedPage>; campusPickerGeneration?: Map<string, number> };
export const pagesCache = (globals.campusPickerCache ??= new TtlCache<PickedPage>(500, 60_000));
const generation = (globals.campusPickerGeneration ??= new Map<string, number>());

export const pagesKey = (userId: string, provider: Provider, query: string, cursor: string | null) =>
  `${userId}:${provider}:${generation.get(`${userId}:${provider}`) ?? 0}:${cursor ?? ""}:${query}`;

/** Après une connexion ou une déconnexion, les anciennes réponses ne servent plus. */
export function forgetPages(userId: string, provider: Provider) {
  const key = `${userId}:${provider}`;
  generation.set(key, (generation.get(key) ?? 0) + 1);
}
