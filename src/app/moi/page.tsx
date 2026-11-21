import Link from "next/link";
import { LogoutButton, ModeLinks } from "@/app/moi/moi-client";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { ProfileCard } from "@/components/profile/profile-visuals";
import { SECTIONS, sectionHref, sectionsFor } from "@/components/profile/settings/sections";
import { SettingsSearch } from "@/components/profile/settings/settings-nav";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { checklistProgress, checklistSteps, type ChecklistStepId } from "@/lib/checklist";
import { checklistFacts } from "@/lib/checklist-server";
import { profileStanding, levelOf } from "@/lib/gamification";
import { IconChevronRight, IconFriends, IconHelp, IconHighlight, IconNews, IconNotifications, IconRequests, IconRevise, IconSubjects, type IconData } from "@/lib/icons";
import { profileOf, visibleStatus } from "@/lib/profile-data";
import { shellCounters } from "@/lib/shell-counters";

export const metadata = { title: "Moi" };

const rowClass = "flex min-h-14 w-full items-center gap-3 px-4 text-left transition-colors active:bg-muted hover-ok:bg-muted";

function Row({ href, icon, label, count }: { href: string; icon: IconData; label: string; count?: number }) {
  return (
    <li>
      <Link href={href} className={rowClass}>
        <Icon icon={icon} className="text-muted-foreground" />
        <span className="flex-1 font-semibold">{label}</span>
        {Boolean(count) && <span className="rounded-full bg-brand-tint px-2 text-xs leading-5 font-semibold text-brand-text tabular-nums">{count}</span>}
        <Icon icon={IconChevronRight} size={16} className="text-muted-foreground" />
      </Link>
    </li>
  );
}

const STEP_ICONS: Record<ChecklistStepId, IconData> = { open: IconSubjects, highlight: IconHighlight, cards: IconRevise, friend: IconFriends, share: IconRequests };

function Group({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">{children}</ul>;
}

/** Onglet Moi (téléphone surtout) : sa carte, ses amis, ses notifications, les paramètres, l'espace, la sortie. */
export default async function MePage() {
  const user = await requireUser();
  const teacher = user.role === "teacher";
  const [counters, profile, standing, facts] = await Promise.all([shellCounters(user), profileOf(user.id), profileStanding(user), teacher ? null : checklistFacts(user)]);
  const level = levelOf(standing.stats.credits);
  const settings = sectionsFor(user.role, true).filter((s) => s.id !== "revision");
  // « Bien démarrer » : les étapes qui restent, chacune mène là où elle se fait ; tout est fait, la section disparaît
  const steps = facts ? checklistSteps(facts, user.prefs.intent) : [];
  const { done, total, complete } = checklistProgress(steps);
  return (
    <Shell user={user}>
      <PageHeader title="Moi" className="sr-only" />
      <div className="grid max-w-xl gap-6">
        <Link href={`/u/${user.id}`} className="block rounded-xl transition-shadow hover-ok:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Mon profil">
          <ProfileCard user={user} profile={profile} status={await visibleStatus(profile)} rarity={standing.rarity} self compact badge={false}
            facts={teacher ? "Enseignant" : `${level.name} · ${standing.stats.credits} crédits`} />
        </Link>
        <Group>
          {!teacher && <Row href="/amis" icon={IconFriends} label="Amis" count={counters.friendRequests} />}
          <Row href="/notifications" icon={IconNotifications} label="Notifications" count={counters.unreadNotifications} />
        </Group>
        <section className="grid gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Paramètres</h2>
          <SettingsSearch allowed={sectionsFor(user.role, true).map((s) => s.id)} />
          <Group>{settings.map((s) => <Row key={s.id} href={sectionHref(s.id)} icon={SECTIONS.find((x) => x.id === s.id)!.icon} label={s.label} />)}</Group>
        </section>
        {steps.length > 0 && !complete && (
          <section className="grid gap-2">
            <h2 className="flex items-baseline justify-between px-1 text-sm font-semibold text-muted-foreground">Bien démarrer<span className="font-normal tabular-nums">{done} sur {total}</span></h2>
            <Group>{steps.filter((step) => !step.done).map((step) => <Row key={step.id} href={step.href} icon={STEP_ICONS[step.id]} label={step.label} />)}</Group>
          </section>
        )}
        <Group>
          <Row href="/actualites" icon={IconNews} label="Actualités" />
          <Row href="/contact" icon={IconHelp} label="Aide" />
        </Group>
        <ModeLinks role={user.role} />
        <LogoutButton />
      </div>
    </Shell>
  );
}
