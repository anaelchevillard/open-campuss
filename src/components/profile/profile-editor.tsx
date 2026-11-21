"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "cn";
import { saveProfileInfo } from "@/app/actions/profile";
import { saveAppearance, saveShowcase, saveStatus, type AppearancePatch } from "@/app/actions/social";
import { Icon } from "@/components/icon";
import { AvatarEditButton, AvatarRemove } from "@/components/profile/avatar-picker";
import { useImagePick } from "@/components/profile/image-crop-dialog";
import { BadgeMedal } from "@/components/profile/badge-medal";
import { ProfileHero, type HeroLevel } from "@/components/profile/profile-hero";
import { FramedAvatar } from "@/components/profile/profile-visuals";
import { Showcase } from "@/components/profile/showcase-editor";
import { DraftText, SettingsGroup, useDraft } from "@/components/profile/settings/autosave";
import { SaveScope } from "@/components/save-guard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { NameStyle, ProfileBanner, ProfileSocials, ProfileStatus, User, UserProfile } from "@/lib/db/schema";
import { badgeOf, type Rarity } from "@/lib/badges";
import { IconError, IconImageAdd, IconLocked, IconUndo } from "@/lib/icons";
import { AVATAR_EFFECTS, AVATAR_FRAMES, bannerBackground, BANNERS, cardSwatchColor, hueColor, NAME_FONTS, NAME_GRADIENTS, NAME_HUES, STATUS_MAX } from "@/lib/name-style";
import { IMAGE_ACCEPT } from "@/lib/image-crop";
import { deleteImage, postImage } from "@/lib/image-upload";
import { SOCIALS, socialLinks, tidyHandle } from "@/lib/socials";
import { bannerUnlock, cardUnlock, fontUnlock, frameUnlock, hueUnlock, type UnlockId, type UnlockState } from "@/lib/unlocks";

type Look = Pick<UserProfile, "nameStyle" | "badgeShown" | "banner" | "profileColors" | "avatarFrame" | "avatarEffect">;
type Info = { pronouns: string; bio: string; favorite: string; socials: ProfileSocials };
type Duration = "heure" | "jour" | "semaine" | "jamais";
type Status = { emoji: string; text: string; duration: Duration };

export type EditorProps = {
  user: Pick<User, "id" | "name" | "avatarKey" | "pronouns" | "bio" | "favoriteSubjectId">; profile: UserProfile | null; rarity: Rarity | null;
  programLabel: string; status: ProfileStatus | null; memberSince: string; level: HeroLevel | null; points: number;
  unlocked: Record<UnlockId, UnlockState>; badges: string[]; docs: { id: string; title: string }[]; subjects: { id: number; label: string }[]; lockedUntil: string | null;
};

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
/** Image de bannière choisie mais pas encore envoyée : pas de clé tant que le serveur ne l'a pas nettoyée. */
const LOCAL_IMAGE: ProfileBanner = { kind: "image", value: "image" };
const isLocalImage = (banner: ProfileBanner | null | undefined) => banner?.kind === "image" && !banner.key;
const lookOf = (p: UserProfile | null): Look => ({ nameStyle: p?.nameStyle ?? null, badgeShown: p?.badgeShown ?? null, banner: p?.banner ?? null, profileColors: p?.profileColors ?? null, avatarFrame: p?.avatarFrame ?? null, avatarEffect: p?.avatarEffect ?? null });

/** Ce qui, dans un style essayé, n'est pas encore débloqué. */
function lockedIn(look: Look, unlocked: Record<UnlockId, UnlockState>): UnlockState[] {
  const style = look.nameStyle ?? {};
  const needs: (UnlockId | null)[] = [
    style.font ? fontUnlock(style.font) : null, style.hue !== undefined ? hueUnlock(style.hue) : null, style.gradient ? "degrade-nom" : null, style.effect ? "effets" : null,
    look.banner && look.banner.kind !== "image" ? bannerUnlock(look.banner.value, look.banner.kind) : null,
    look.profileColors?.card !== undefined ? cardUnlock(Number(look.profileColors.card)) : null,
    look.avatarFrame ? frameUnlock(look.avatarFrame) : null, look.avatarEffect ? "effets" : null,
  ];
  return [...new Set(needs.filter((id): id is UnlockId => Boolean(id)))].map((id) => unlocked[id]).filter((u) => !u.open);
}

/** Différence entre deux styles : seuls les éléments changés partent au serveur. */
function lookPatch(next: Look, base: Look): AppearancePatch {
  return Object.fromEntries((Object.keys(next) as (keyof Look)[]).filter((key) => !same(next[key], base[key])).map((key) => [key, next[key]]));
}

/**
 * Personnalisation sur son vrai profil : l'en-tête change en direct, rien n'est gardé avant « Enregistrer ».
 * Les options verrouillées s'essaient (rendu réel, cadenas) mais ne s'enregistrent pas.
 */
export function ProfileEditor(props: EditorProps) {
  // Les brouillons (useDraft) se déclarent auprès du SaveScope : il doit les englober
  return <SaveScope><ProfileEditorBody {...props} /></SaveScope>;
}

function ProfileEditorBody(props: EditorProps) {
  const { user, profile, unlocked, lockedUntil } = props;
  const initialLook = lookOf(profile);
  // Image de bannière choisie : montrée tout de suite (URL d'objet), envoyée à « Enregistrer »
  const [bannerFile, setBannerFile] = useState<{ file: Blob; url: string; sent: boolean } | null>(null);
  const localUrl = bannerFile?.url;
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);
  // Réglage visé depuis la recherche (« Instagram » → Réseaux) : on y descend et on place le curseur dans son premier champ
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("ancre") || window.location.hash.slice(1);
    const section = target && /^[a-z-]{1,20}$/.test(target) ? document.getElementById(target) : null;
    if (!section) return;
    section.scrollIntoView({ block: "start" });
    section.querySelector<HTMLElement>("input:not([type=file]), textarea, button[role=radio]")?.focus({ preventScroll: true });
  }, []);
  const [look, setLook] = useDraft<Look>("profil:apparence", initialLook, async (next) => {
    if (lockedUntil) return { ok: false, error: `Apparence réinitialisée par la modération : modifiable le ${lockedUntil}` };
    const locked = lockedIn(next, unlocked);
    if (locked.length) return { ok: false, error: `Pas encore débloqué : ${locked.map((l) => l.label).join(", ")}. Choisis une option ouverte ou reviens à ton style.` };
    const patch = lookPatch(next, initialLook);
    if ("banner" in patch) {
      const hadImage = initialLook.banner?.kind === "image" && Boolean(initialLook.banner.key);
      if (isLocalImage(next.banner) && bannerFile && !bannerFile.sent) {
        // L'image passe par sa route (réencodée, réservée à qui l'a débloquée), qui l'enregistre comme bannière
        try { await postImage(bannerFile.file, "/api/account/banner"); } catch (error) { return { ok: false, error: (error as Error).message }; }
        setBannerFile({ ...bannerFile, sent: true });
        delete patch.banner;
      } else if (isLocalImage(next.banner)) delete patch.banner;
      else if (hadImage) {
        // L'ancienne image est effacée du stockage
        try { await deleteImage("/api/account/banner"); } catch (error) { return { ok: false, error: (error as Error).message }; }
      }
    }
    return Object.keys(patch).length ? saveAppearance(patch) : { ok: true };
  }, { same });
  const initialInfo: Info = { pronouns: user.pronouns, bio: user.bio, favorite: user.favoriteSubjectId ? String(user.favoriteSubjectId) : "", socials: profile?.socials ?? {} };
  const [info, setInfo] = useDraft<Info>("profil:infos", initialInfo, (next) => saveProfileInfo({
    ...(next.pronouns !== initialInfo.pronouns ? { pronouns: next.pronouns } : {}), ...(next.bio !== initialInfo.bio ? { bio: next.bio } : {}),
    ...(next.favorite !== initialInfo.favorite ? { favorite: next.favorite } : {}), ...(!same(next.socials, initialInfo.socials) ? { socials: next.socials } : {}),
  }), { same });
  const [status, setStatus] = useDraft<Status>("profil:statut", { emoji: props.status?.emoji ?? "", text: props.status?.text ?? "", duration: props.status?.expiresAt ? "jour" : "jamais" }, (next) => saveStatus(next), { same });

  const locked = lockedIn(look, unlocked);
  const preview: UserProfile = { ...(profile ?? emptyProfile(user.id)), ...look };
  const bannerSrc = isLocalImage(look.banner) ? bannerFile?.url : undefined;
  const favorite = props.subjects.find((s) => String(s.id) === info.favorite);
  const facts = [props.programLabel, info.pronouns, favorite ? `aime ${favorite.label.replace(/^L\d · /, "")}` : ""].filter(Boolean).join(" · ");
  const liveStatus = status.text || status.emoji ? { text: status.text, emoji: status.emoji || undefined } : null;
  const style = look.nameStyle ?? {};
  const setStyle = (patch: Partial<NameStyle>) => {
    const merged = Object.fromEntries(Object.entries({ ...style, ...patch }).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    setLook({ ...look, nameStyle: Object.keys(merged).length ? merged : null });
  };
  const pick = (patch: Partial<Look>) => setLook({ ...look, ...patch });

  return (
    <>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:items-start">
        <div className="grid min-w-0 gap-3 lg:sticky lg:top-20">
          <ProfileHero person={user} profile={preview} rarity={props.rarity} facts={facts} status={liveStatus} bio={info.bio} links={socialLinks(info.socials)}
            memberSince={props.memberSince} level={props.level} points={props.points} own bannerSrc={bannerSrc}
            editAvatar={(avatar) => <AvatarEditButton hasAvatar={Boolean(user.avatarKey)}>{avatar}</AvatarEditButton>}
            actions={<Link href={`/u/${user.id}`} data-slot="button" className={buttonVariants({ variant: "outline" })}>Terminer</Link>} />
          {locked.length > 0 && <TrialNote onBack={() => setLook(initialLook)} />}
          {lockedUntil && <p className="flex items-start gap-2 rounded-xl bg-warning-tint p-4 text-sm text-warning-foreground"><Icon icon={IconError} size={16} className="mt-0.5" />Apparence réinitialisée par la modération · modifiable le {lockedUntil}</p>}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-8">
          {/* Ordre : le compte d'abord (infos, statut, réseaux), puis les personnalisations */}
          <SettingsGroup id="infos" title="Infos du compte">
            <div id="photo" className="scroll-mt-24"><AvatarRemove hasAvatar={Boolean(user.avatarKey)} /></div>
            <div id="nom" className="grid scroll-mt-24 gap-1">
              <span className="text-sm font-semibold">Nom</span>
              <p className="text-sm text-muted-foreground">{user.name} · repris de ton adresse universitaire. Les personnes qui ne sont pas tes amis voient ton prénom et l’initiale de ton nom. Une erreur ? <Link href="/contact" className="font-semibold text-link underline-offset-2 hover:underline">Écris à l’équipe</Link></p>
            </div>
            <div id="pronoms" className="scroll-mt-24"><DraftText id="pronouns" label="Pronoms" value={info.pronouns} maxLength={30} placeholder="elle, il, iel…" onChange={(pronouns) => setInfo({ ...info, pronouns })} /></div>
            <div id="bio" className="scroll-mt-24"><DraftText id="bio-text" label="Bio" value={info.bio} maxLength={280} multiline hint={`${info.bio.length} / 280`} onChange={(bio) => setInfo({ ...info, bio })} /></div>
            <FavoriteSubject value={info.favorite} subjects={props.subjects} onChange={(value) => setInfo({ ...info, favorite: value })} />
          </SettingsGroup>

          <StatusEditor value={status} onChange={setStatus} />

          <SettingsGroup id="reseaux" title="Réseaux" description="Ton identifiant seul, sans lien. Visibles par tes amis.">
            {SOCIALS.map((social) => {
              const value = info.socials[social.id] ?? "";
              const handle = tidyHandle(value);
              const invalid = Boolean(handle) && !social.pattern.test(handle);
              return (
                <div key={social.id} className="grid gap-1.5">
                  <Label htmlFor={`social-${social.id}`}>{social.label}</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">@</span>
                    <Input id={`social-${social.id}`} value={value} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={invalid || undefined} className="pl-7 text-base"
                      onChange={(e) => setInfo({ ...info, socials: { ...info.socials, [social.id]: e.target.value } })} />
                  </div>
                  {invalid && <p role="alert" className="text-sm text-destructive-foreground">Identifiant seul : {social.rule}</p>}
                </div>
              );
            })}
          </SettingsGroup>

          <p className="border-t border-border pt-6 text-sm font-semibold text-muted-foreground">Personnalisation</p>
          <SettingsGroup id="cadre" title="Cadre d’avatar">
            <Options>
              <Choice active={!look.avatarFrame} onClick={() => pick({ avatarFrame: null })}>Aucun</Choice>
              {AVATAR_FRAMES.map((frame) => (
                <Choice key={frame.id} active={look.avatarFrame === frame.id} lock={unlocked[frameUnlock(frame.id)!]} onClick={() => pick({ avatarFrame: frame.id })}>
                  <span className="flex min-w-0 items-center gap-3 py-1"><FramedAvatar user={user} profile={{ avatarFrame: frame.id, avatarEffect: null }} size={32} rarity={props.rarity ?? "commun"} /><span className="min-w-0">{frame.label}{frame.animated && <span className="block text-xs font-normal text-muted-foreground">Animé</span>}</span></span>
                </Choice>
              ))}
            </Options>
            <Field label="Lueur du cadre">
              <Options>
                <Choice active={!look.avatarEffect} onClick={() => pick({ avatarEffect: null })}>Sans</Choice>
                {AVATAR_EFFECTS.map((effect) => <Choice key={effect.id} active={look.avatarEffect === effect.id} lock={unlocked.effets} onClick={() => pick({ avatarEffect: effect.id })}>{effect.label}</Choice>)}
              </Options>
            </Field>
          </SettingsGroup>

          <SettingsGroup id="banniere" title="Bannière et carte">
            <div role="radiogroup" aria-label="Bannière" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Tile label="Aucune" active={!look.banner} onClick={() => pick({ banner: null })} />
              {BANNERS.map((b) => {
                const value = { kind: b.kind, value: b.id } as const;
                return <Tile key={b.id} label={b.label} background={bannerBackground(value)} animated={b.kind === "animated"} active={look.banner?.value === b.id} lock={unlocked[bannerUnlock(b.id, b.kind)]} onClick={() => pick({ banner: value })} />;
              })}
            </div>
            {unlocked["banniere-image"].condition !== "Indisponible" && (
              <BannerImage lock={unlocked["banniere-image"]} hasImage={look.banner?.kind === "image"}
                onPick={(file) => { setBannerFile({ file, url: URL.createObjectURL(file), sent: false }); pick({ banner: LOCAL_IMAGE }); }}
                onRemove={() => pick({ banner: null })} />
            )}
            <Field label="Fond de la carte">
              <div role="radiogroup" aria-label="Fond de la carte" className="flex flex-wrap gap-2">
                <Swatch label="Par défaut" active={!look.profileColors?.card} onClick={() => pick({ profileColors: null })} />
                {NAME_HUES.map((hue) => <Swatch key={hue.h} label={hue.label} color={cardSwatchColor(hue.h)} active={look.profileColors?.card === String(hue.h)} lock={unlocked[cardUnlock(hue.h)]} onClick={() => pick({ profileColors: { card: String(hue.h) } })} />)}
              </div>
            </Field>
          </SettingsGroup>

          <SettingsGroup id="apparence" title="Nom">
            <Field label="Police">
              <Options>
                <Choice active={!style.font} onClick={() => setStyle({ font: undefined })}><span className="text-lg">Aa</span><Small>Standard</Small></Choice>
                {NAME_FONTS.map((font) => (
                  <Choice key={font.id} active={style.font === font.id} lock={unlocked[fontUnlock(font.id)]} onClick={() => setStyle({ font: font.id })}>
                    <span className="text-lg" style={{ fontFamily: font.family }}>Aa</span><Small>{font.label}</Small>
                  </Choice>
                ))}
              </Options>
            </Field>
            <Field label="Couleur">
              <div role="radiogroup" aria-label="Couleur du nom" className="flex flex-wrap gap-2">
                <Swatch label="Aucune" active={style.hue === undefined && !style.gradient} onClick={() => setStyle({ hue: undefined, gradient: undefined })} />
                {NAME_HUES.map((hue) => <Swatch key={hue.h} label={hue.label} color={hueColor(hue.h)} active={style.hue === hue.h && !style.gradient} lock={unlocked[hueUnlock(hue.h)]} onClick={() => setStyle({ hue: hue.h, gradient: undefined })} />)}
              </div>
            </Field>
            <Field label="Dégradé">
              <div role="radiogroup" aria-label="Dégradé du nom" className="flex flex-wrap gap-2">
                {NAME_GRADIENTS.map((g) => <Swatch key={g.id} label={g.label} color={`linear-gradient(135deg, ${hueColor(g.from)}, ${hueColor(g.to)})`} active={style.gradient === g.id} lock={unlocked["degrade-nom"]} onClick={() => setStyle({ gradient: g.id, hue: undefined })} />)}
              </div>
            </Field>
            <Field label="Reflet">
              <Options>
                <Choice active={!style.effect} onClick={() => setStyle({ effect: undefined })}>Sans</Choice>
                <Choice active={style.effect === "reflet"} lock={unlocked.effets} onClick={() => setStyle({ effect: "reflet" })}><span className="user-name font-semibold" data-effect="reflet"><span className="user-name-text">Reflet</span></span></Choice>
              </Options>
            </Field>
            <Field label="Badge à côté du nom">
              {props.badges.length ? (
                <Options>
                  <Choice active={!look.badgeShown} onClick={() => pick({ badgeShown: null })}>Aucun</Choice>
                  {props.badges.map((id) => { const b = badgeOf(id)!; return <Choice key={id} active={look.badgeShown === id} onClick={() => pick({ badgeShown: id })}><span className="flex items-center gap-2"><BadgeMedal icon={b.icon} rarity={b.rarity} hue={b.hue} size={24} />{b.name}</span></Choice>; })}
                </Options>
              ) : <p className="text-sm text-muted-foreground">Ton premier badge pourra s’afficher ici.</p>}
            </Field>
          </SettingsGroup>



          <Showcase lock={unlocked.vitrine} docs={props.docs} badges={props.badges} initial={profile?.showcase ?? { docs: [], badges: [] }} save={saveShowcase} />
        </div>
      </div>
    </>
  );
}

function emptyProfile(userId: string): UserProfile {
  return { userId, nameStyle: null, badgeShown: null, banner: null, profileColors: null, avatarFrame: null, avatarEffect: null, status: null, showcase: null, privacy: {}, socials: null, appearanceLockedUntil: null, updatedAt: new Date(0) };
}

function Small({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold">{children}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-2"><span className="text-sm font-semibold">{label}</span>{children}</div>;
}

function Options({ children }: { children: ReactNode }) {
  return <div role="radiogroup" className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">{children}</div>;
}

/** Cadenas posé sur le rendu réel ; la condition au survol et dans la note d'essai. */
function LockPip({ lock, className }: { lock?: UnlockState; className?: string }) {
  if (!lock || lock.open) return null;
  return <span className={cn("absolute flex size-5 items-center justify-center rounded-full bg-card text-muted-foreground shadow-xs", className)}><Icon icon={IconLocked} size={16} label={`Verrouillé : ${lock.condition}`} /></span>;
}

function Choice({ active, lock, onClick, children }: { active: boolean; lock?: UnlockState; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={active} title={lock && !lock.open ? `${lock.label} · ${lock.condition}` : undefined} onClick={onClick}
      className={cn("relative grid min-h-14 min-w-0 content-center [overflow-wrap:anywhere] justify-items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors coarse:min-h-16",
        active ? "border-brand-text bg-brand-tint text-brand-text" : "border-border hover:bg-muted")}>
      {children}
      {lock && !lock.open && <span className="text-xs font-normal text-muted-foreground">{lock.condition}</span>}
      <LockPip lock={lock} className="top-1.5 right-1.5" />
    </button>
  );
}

function Swatch({ label, color, active, lock, onClick }: { label: string; color?: string; active: boolean; lock?: UnlockState; onClick: () => void }) {
  const locked = lock && !lock.open;
  return (
    <button type="button" role="radio" aria-checked={active} aria-label={locked ? `${label} (verrouillé : ${lock.condition})` : label} title={locked ? `${label} · ${lock.condition}` : label} onClick={onClick}
      className={cn("relative flex size-11 items-center justify-center rounded-full border border-border transition-transform fine:size-9 motion-ok:active:scale-95", active && "ring-2 ring-brand-text ring-offset-2 ring-offset-card")}
      style={{ background: color ?? "var(--card)" } as CSSProperties}>
      {!color && <span className="h-0.5 w-5 rotate-45 rounded-full bg-muted-foreground" />}
      <LockPip lock={lock} className="-right-1 -bottom-1" />
    </button>
  );
}

function Tile({ label, background, animated, active, lock, onClick }: { label: string; background?: string; animated?: boolean; active: boolean; lock?: UnlockState; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={active} title={lock && !lock.open ? `${label} · ${lock.condition}` : undefined} onClick={onClick}
      className={cn("group grid gap-1.5 rounded-lg p-1 text-left text-sm transition-colors hover:bg-muted", active && "bg-brand-tint text-brand-text")}>
      <span className={cn("relative block h-14 rounded-md border border-border", active && "ring-2 ring-brand-text")} style={{ background: background ?? "var(--muted)" }} data-banner-anim={animated ? "" : undefined}>
        <LockPip lock={lock} className="top-1 right-1 size-6" />
      </span>
      <span className="px-1 font-semibold">{label}</span>
      {lock && !lock.open && <span className="px-1 text-xs text-muted-foreground">{lock.condition}</span>}
    </button>
  );
}

/** Une option verrouillée est en essai sur le profil : pas de phrase, la condition est sous chaque option. */
function TrialNote({ onBack }: { onBack: () => void }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon icon={IconLocked} size={16} />
      <span>Essai</span>
      <Button variant="ghost" size="sm" onClick={onBack}><Icon icon={IconUndo} size={16} />Revenir à mon style</Button>
    </div>
  );
}

function FavoriteSubject({ value, subjects, onChange }: { value: string; subjects: { id: number; label: string }[]; onChange: (value: string) => void }) {
  const items = [{ value: "", label: "Aucune" }, ...subjects.map((s) => ({ value: String(s.id), label: s.label }))];
  return (
    <div id="matiere" className="grid scroll-mt-24 gap-1.5">
      <Label htmlFor="favorite">Matière préférée</Label>
      <Select items={items} value={value} onValueChange={(next) => onChange(String(next ?? ""))}>
        <SelectTrigger id="favorite" className="w-full text-base"><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((item) => <SelectItem key={item.value || "none"} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

const EMOJIS = ["📚", "✍️", "🎯", "☕", "🔥", "😴", "🧠", "🎉", "🤒", "🏖️", "⚖️", "💬"];
const DURATIONS: { value: Duration; label: string }[] = [{ value: "heure", label: "1 h" }, { value: "jour", label: "Aujourd’hui" }, { value: "semaine", label: "Semaine" }, { value: "jamais", label: "Toujours" }];

function StatusEditor({ value, onChange }: { value: Status; onChange: (value: Status) => void }) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Status>) => onChange({ ...value, ...patch });
  return (
    <SettingsGroup id="statut" title="Statut">
      <div className="flex min-w-0 gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button variant="outline" size="icon-lg" aria-label="Choisir un emoji" className="text-lg" />}>{value.emoji || "🙂"}</PopoverTrigger>
          <PopoverContent align="start" className="grid w-auto grid-cols-6 gap-1 p-2">
            {EMOJIS.map((emoji) => (
              <button key={emoji} type="button" aria-pressed={value.emoji === emoji} onClick={() => { set({ emoji: value.emoji === emoji ? "" : emoji }); setOpen(false); }}
                className="flex size-11 items-center justify-center rounded-lg text-xl transition-colors hover:bg-muted aria-pressed:bg-brand-tint fine:size-9">{emoji}</button>
            ))}
          </PopoverContent>
        </Popover>
        <Input aria-label="Texte du statut" value={value.text} maxLength={STATUS_MAX} placeholder="En révision de droit civil" className="text-base" onChange={(e) => set({ text: e.target.value })} />
      </div>
      {/* Deux colonnes dans une carte étroite (téléphone, colonne de droite sur ordinateur), quatre au-delà de 24 rem : jamais de débordement */}
      <div className="@container">
        <ToggleGroup aria-label="Durée du statut" variant="outline" spacing={1} className="grid w-full grid-cols-2 @sm:grid-cols-4" value={[value.duration]} onValueChange={(values: string[]) => values[0] && set({ duration: values[0] as Duration })}>
          {DURATIONS.map((d) => <ToggleGroupItem key={d.value} value={d.value} className="min-h-9 min-w-0 aria-pressed:bg-brand-tint aria-pressed:font-semibold aria-pressed:text-brand-text coarse:min-h-11">{d.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      {(value.text || value.emoji) && <Button variant="ghost" className="justify-self-start text-muted-foreground" onClick={() => set({ emoji: "", text: "" })}>Effacer le statut</Button>}
    </SettingsGroup>
  );
}

/**
 * L'image de bannière : vérifiée dès le choix (type, poids, dimensions), recadrée au bon format si besoin,
 * montrée tout de suite dans l'en-tête, envoyée avec le reste à « Enregistrer ».
 */
function BannerImage({ lock, hasImage, onPick, onRemove }: { lock: UnlockState; hasImage: boolean; onPick: (image: Blob) => void; onRemove: () => void }) {
  const image = useImagePick("banner", onPick);
  if (!lock.open) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon icon={IconImageAdd} size={16} />Image : {lock.condition}</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {/* Vraie action, pas une navigation : un <label> qui ouvre le choix de fichier (l'input est dedans), d'où nativeButton={false} */}
      <Button variant="outline" render={<label />} nativeButton={false} className="cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
        <Icon icon={IconImageAdd} size={16} />{hasImage ? "Changer l’image" : "Mettre une image"}
        <input type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (file) void image.pick(file);
        }} />
      </Button>
      {hasImage && <Button variant="ghost" className="text-muted-foreground" onClick={() => { image.setError(""); onRemove(); }}>Retirer l’image</Button>}
      {image.error && <p role="alert" className="flex basis-full items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{image.error}</p>}
      <p className="basis-full text-sm text-muted-foreground">Format 4 sur 1, 600 × 150 pixels au moins. Une autre forme se recadre avant l’aperçu.</p>
      {image.dialog}
    </div>
  );
}
