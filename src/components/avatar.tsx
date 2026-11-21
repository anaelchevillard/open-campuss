import { cn } from "cn";
import type { User } from "@/lib/db/schema";

/** Photo de la personne, sinon ses initiales sur une teinte calme (jamais de cercle vide). */
export function Avatar({ user, size = 40, className = "" }: { user: Pick<User, "id" | "name" | "avatarKey">; size?: number; className?: string }) {
  const initials = (user.name || "?").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
  const style = { width: size, height: size };
  if (user.avatarKey) {
    // La clé dans l'URL fait changer l'image dès qu'une nouvelle photo est envoyée
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/avatars/${user.id}?v=${user.avatarKey.slice(-8)}`} alt="" width={size} height={size} style={style} className={cn("shrink-0 rounded-full object-cover ring-1 ring-border", className)} />;
  }
  return <span aria-hidden="true" style={{ ...style, fontSize: Math.round(size * 0.38) }} className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-tint font-semibold text-brand-text ring-1 ring-border", className)}>{initials}</span>;
}
