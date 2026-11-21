import { TtlCache } from "./ttl-cache";

export type ShellCounters = {
  // Rôle et licence au moment de la lecture : un changement doit se voir tout de suite
  scope: string;
  credits: number;
  unseenBadges: string[];
  toReview: number;
  pendingAccounts: number;
  openReports: number;
  invites: number;
  friendRequests: number;
  unreadNotifications: number;
  // Fiches à revoir : la pastille de Réviser
  dueCards: number;
};

const SHELL_TTL_MS = 30_000;
const SHELL_MAX_USERS = 2000;

// Sur globalThis, comme la connexion à la base : chaque point d'entrée de Next peut avoir sa copie du module
const globals = globalThis as unknown as { campusShellCache?: TtlCache<ShellCounters> };
export const shellCache = (globals.campusShellCache ??= new TtlCache<ShellCounters>(SHELL_MAX_USERS, SHELL_TTL_MS));

/** Ce qu'a fait cette personne doit se voir à la page suivante. */
export const forgetShellCounters = (...userIds: (string | null | undefined)[]) => {
  for (const id of userIds) if (id) shellCache.delete(id);
};

/** La modération change les compteurs de tous ceux qui modèrent. C'est rare : on repart de zéro. */
export const forgetAllShellCounters = () => shellCache.clear();
