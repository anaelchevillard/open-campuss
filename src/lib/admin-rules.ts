/** Règles pures de protection de l'administration, testées sans base. */
export type AdminSeat = { id: string; active: boolean; secondFactor: boolean; isOwner: boolean };
export type AdminChange = "demote" | "disable" | "delete" | "reset2fa";

export function lastAdminRefusal(seats: AdminSeat[], targetId: string, change: AdminChange): string | null {
  const target = seats.find((s) => s.id === targetId);
  if (!target) return null;
  if (target.isOwner && change !== "reset2fa") return "Ce compte est celui du propriétaire du site : il ne peut être ni rétrogradé, ni suspendu, ni supprimé.";
  // Après l'action, reste-t-il un administrateur actif avec un second facteur ?
  const remaining = seats.filter((s) => s.active && s.secondFactor && s.id !== targetId);
  if (!remaining.length) return "Impossible : le site n’aurait plus aucun administrateur actif avec un second facteur.";
  return null;
}
