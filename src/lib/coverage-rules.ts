import type { Category } from "@/lib/db/schema";

/** Les types de documents attendus dans chaque matière (sans base : utilisable par les actions et le navigateur). */
export const WANTED = ["cours", "fiche", "partiel"] as const satisfies readonly Category[];
export type Wanted = (typeof WANTED)[number];
