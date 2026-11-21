import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { UserName } from "@/components/user-name";
import type { ProfileStatus, User, UserProfile } from "@/lib/db/schema";
import { bannerAnimated, bannerBackground, isAvatarEffect, profileColorVars } from "@/lib/name-style";
import type { Rarity } from "@/lib/badges";
import { IconLaurel, IconSecurity, IconStreak, IconToFix } from "@/lib/icons";

export const bannerUrl = (userId: string, key?: string) => (key ? `/api/account/banner/${userId}?v=${key.slice(-8)}` : undefined);

/** Bannière : dégradé, motif ou image ; sans choix, une teinte calme. */
export function ProfileBanner({ userId, profile, src, className, children }: { userId: string; profile: Pick<UserProfile, "banner"> | null; src?: string; className?: string; children?: ReactNode }) {
  // `src` : image choisie dans la personnalisation, montrée avant l'envoi
  const background = bannerBackground(profile?.banner, src ?? bannerUrl(userId, profile?.banner?.key));
  return (
    <div className={cn("relative overflow-hidden", !background && "bg-[color-mix(in_oklab,var(--brand-text)_14%,var(--card))]", className)} style={background ? { background } : undefined}
      data-banner-anim={bannerAnimated(profile?.banner) ? "" : undefined}>
      {children}
    </div>
  );
}

const PIPS = { serie: IconStreak, bouclier: IconSecurity, laurier: IconLaurel, plume: IconToFix } as const;

/** Avatar avec son cadre (rareté, série, bouclier, laurier, plume) et sa lueur : animée (« lueur », qui respire) ou fixe (« halo »). */
export function FramedAvatar({ user, profile, size = 96, rarity, className }: { user: Pick<User, "id" | "name" | "avatarKey">; profile: Pick<UserProfile, "avatarFrame" | "avatarEffect"> | null; size?: number; rarity?: Rarity | null; className?: string }) {
  const frame = profile?.avatarFrame && (profile.avatarFrame !== "rarete" || rarity) ? profile.avatarFrame : undefined;
  const pip = frame && frame in PIPS ? PIPS[frame as keyof typeof PIPS] : null;
  return (
    <span className={cn("avatar-frame", className)} data-frame={frame} data-rarity={frame === "rarete" ? rarity ?? undefined : undefined} data-effect={frame && isAvatarEffect(profile?.avatarEffect) ? profile.avatarEffect : undefined}>
      <Avatar user={user} size={size} className="ring-0" />
      {pip && size >= 48 && (
        <span className="absolute -right-1 -bottom-1 inline-flex size-7 items-center justify-center rounded-full bg-card text-(--frame) shadow-xs"><Icon icon={pip} size={16} /></span>
      )}
    </span>
  );
}

export function StatusLine({ status, className }: { status: ProfileStatus | null; className?: string }) {
  if (!status) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-sm text-pretty", className)}>
      {status.emoji && <span aria-hidden className="text-base leading-none">{status.emoji}</span>}
      <span className="min-w-0 wrap-break-word">{status.text}</span>
    </p>
  );
}

export const profileCardStyle = (profile: Pick<UserProfile, "profileColors"> | null) => profileColorVars(profile?.profileColors) as CSSProperties;

/** Carte de profil telle que les autres la voient : aperçu des paramètres, Moi, fiche courte. */
export function ProfileCard({ user, profile, facts, status, rarity, self, compact, className, children, badge = true }: {
  user: Pick<User, "id" | "name" | "avatarKey">; profile: UserProfile | null; facts?: string; status?: ProfileStatus | null; rarity?: Rarity | null;
  self?: boolean; compact?: boolean; className?: string; children?: ReactNode; badge?: boolean;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl bg-(--profile-card,var(--card)) shadow-xs [--frame-gap:var(--profile-card,var(--card))]", className)} style={profileCardStyle(profile)}>
      <ProfileBanner userId={user.id} profile={profile} className={compact ? "h-14" : "h-24"} />
      <div className={cn("grid gap-1 px-4 pb-4", compact ? "-mt-7" : "-mt-10")}>
        <FramedAvatar user={user} profile={profile} size={compact ? 56 : 72} rarity={rarity} />
        <p className="mt-2 text-lg leading-snug"><UserName user={user} profile={profile} variant="rich" showBadge={badge} self={self} /></p>
        {facts && <p className="text-sm text-muted-foreground">{facts}</p>}
        <StatusLine status={status ?? null} />
        {children}
      </div>
    </div>
  );
}
