import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { FramedAvatar, ProfileBanner, profileCardStyle, StatusLine } from "@/components/profile/profile-visuals";
import { UserName } from "@/components/user-name";
import type { ProfileStatus, User, UserProfile } from "@/lib/db/schema";
import type { Rarity } from "@/lib/badges";
import { IconCalendar, IconExternal } from "@/lib/icons";
import { hueColor, NAME_HUES } from "@/lib/name-style";

export type HeroLevel = { level: number; xp: number; into: number; span: number };
export type HeroLink = { id: string; label: string; handle: string; href: string };

const nf = new Intl.NumberFormat("fr-FR");

/** Pastille de niveau façon Steam : sa couleur change toutes les dizaines. */
export function LevelBadge({ level, className }: { level: number; className?: string }) {
  const hue = NAME_HUES[Math.floor(level / 10) % NAME_HUES.length].h;
  return (
    <span aria-hidden className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-(--lvl) text-sm font-semibold text-(--lvl) tabular-nums", className)}
      style={{ "--lvl": hueColor(hue) } as CSSProperties}>{level}</span>
  );
}

/**
 * En-tête d'un profil, tel que tout le monde le voit. Sert aussi à la personnalisation : on y modifie
 * directement son vrai profil, en direct, avant d'enregistrer.
 */
export function ProfileHero({ person, profile, rarity, facts, status, bio, links, memberSince, level, points, own, actions, children, editAvatar, bannerSrc }: {
  person: Pick<User, "id" | "name" | "avatarKey">; profile: UserProfile | null; rarity: Rarity | null; facts: string; status: ProfileStatus | null; bio: string;
  links: HeroLink[]; memberSince: string; level: HeroLevel | null; points: number; own: boolean; actions?: ReactNode; children?: ReactNode;
  /** Personnalisation : enveloppe l'avatar (photo cliquable). */
  editAvatar?: (avatar: ReactNode) => ReactNode;
  /** Personnalisation : image de bannière choisie mais pas encore envoyée (URL d'objet locale). */
  bannerSrc?: string;
}) {
  const avatar = <FramedAvatar user={person} profile={profile} size={96} rarity={rarity} className={editAvatar ? undefined : "-mt-12 md:-mt-14"} />;
  return (
    <header className="overflow-hidden rounded-xl bg-(--profile-card,var(--card)) shadow-xs [--frame-gap:var(--profile-card,var(--card))]" style={profileCardStyle(profile)}>
      <ProfileBanner userId={person.id} profile={profile} src={bannerSrc} className="h-28 md:h-40" />
      <div className="grid gap-4 px-4 pb-5 md:px-6">
        {editAvatar ? <div className="-mt-12 justify-self-start md:-mt-14">{editAvatar(avatar)}</div> : avatar}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="grid min-w-0 gap-1">
            <h1 className="title"><UserName user={person} profile={profile} variant="rich" showBadge self={own} /></h1>
            {facts && <p className="text-muted-foreground">{facts}</p>}
            <StatusLine status={status} className="mt-1" />
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {bio && <p className="max-w-[60ch] whitespace-pre-line text-pretty wrap-break-word">{bio}</p>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {level && (
            <span className="flex items-center gap-2">
              <LevelBadge level={level.level} />
              <span className="grid leading-tight">
                <span className="font-semibold text-foreground">Niveau {level.level}</span>
                <span className="tabular-nums">{nf.format(level.xp)} XP</span>
              </span>
            </span>
          )}
          <span className="tabular-nums"><span className="font-semibold text-foreground">{nf.format(points)}</span> point{points > 1 ? "s" : ""} de contribution</span>
          <span className="flex items-center gap-1.5"><Icon icon={IconCalendar} size={16} />Membre depuis {memberSince}</span>
        </div>
        {links.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Réseaux">
            {links.map((link) => (
              <li key={link.id}>
                <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-sm transition-colors hover:bg-border">
                  <span className="font-semibold">{link.label}</span><span className="text-muted-foreground">@{link.handle}</span><Icon icon={IconExternal} size={16} className="text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </header>
  );
}

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
export const memberSinceText = (date: Date) => MONTH.format(date);
