/**
 * Ligue d'amis de la semaine : coopérative d'abord (objectif commun), un rang sans relégation ni perte.
 * Entre amis qui ont tous choisi de partager leur révision ; remise à zéro chaque lundi (semaine de Paris).
 */
export const WEEKLY_CARDS_PER_MEMBER = 150;
export const LEAGUE_MAX = 30;

export type LeagueMember = { id: string; name: string; xp: number; cards: number; me?: boolean };
export type LeagueRow = LeagueMember & { rank: number };

export function leagueOf(members: LeagueMember[]) {
  const sorted = [...members].sort((a, b) => b.xp - a.xp || b.cards - a.cards || a.name.localeCompare(b.name, "fr")).slice(0, LEAGUE_MAX);
  // Deux personnes à égalité partagent le même rang
  const rows: LeagueRow[] = sorted.map((member, index) => ({ ...member, rank: index > 0 && sorted[index - 1].xp === member.xp ? 0 : index + 1 }));
  for (let i = 1; i < rows.length; i++) if (!rows[i].rank) rows[i].rank = rows[i - 1].rank;
  const total = sorted.reduce((sum, member) => sum + member.cards, 0);
  const target = WEEKLY_CARDS_PER_MEMBER * Math.max(1, sorted.length);
  return { rows, total, target, percent: Math.min(100, Math.round((total / target) * 100)), myRank: rows.find((row) => row.me)?.rank ?? null };
}

/** La ligue n'existe que si je partage et qu'au moins un ami partage aussi. */
export const leagueVisible = (iShare: boolean, sharingFriends: number) => iShare && sharingFriends > 0;
