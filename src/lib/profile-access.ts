import type { User } from "./db/schema";

/** Un profil n'est visible que dans sa licence ; les administrateurs sont visibles de tous (ils relisent les cours). */
export function canSeeProfile(viewer: Pick<User, "id" | "role" | "programId">, target: Pick<User, "id" | "role" | "programId" | "status">) {
  if (viewer.id === target.id || viewer.role === "admin") return true;
  if (target.status !== "active") return false;
  return target.role === "admin" || (target.programId !== null && target.programId === viewer.programId);
}
