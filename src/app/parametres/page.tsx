import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { SECTIONS, sectionHref, sectionsFor } from "@/components/profile/settings/sections";
import { SettingsPage } from "@/components/profile/settings/settings-page";
import { requireUserAny } from "@/lib/auth";
import { IconChevronRight } from "@/lib/icons";
import { ProfileCard } from "@/components/profile/profile-visuals";
import { profileOf, visibleStatus } from "@/lib/profile-data";

export const metadata: Metadata = { title: "Paramètres" };

/**
 * Accueil des paramètres. Au téléphone (et sur tablette en portrait) : la liste des sections, chacune avec ce qu'on y règle.
 * Sur ordinateur, la colonne de gauche est LA navigation : au centre, une vue d'ensemble (sa carte, l'essentiel de son compte),
 * jamais la liste une deuxième fois.
 * La personnalisation du profil en est une entrée (« Profil et apparence »), pas la page d'arrivée.
 * Mot de passe provisoire ou second facteur exigé : la page Compte et sécurité, directement (redirection au serveur).
 */
export default async function SettingsHome({ searchParams }: PageProps<"/parametres">) {
  const user = await requireUserAny();
  const securite = (await searchParams).securite === "1";
  if (user.mustChangePassword || securite) redirect(`/parametres/compte${securite ? "?securite=1" : ""}`);
  const allowed = sectionsFor(user.role, true).map((s) => s.id);
  const sections = SECTIONS.filter((s) => allowed.includes(s.id));
  const groups = [...new Set(sections.map((s) => s.group))];
  const profile = await profileOf(user.id);
  const theme = user.prefs.theme === "dark" ? "Sombre" : user.prefs.theme === "light" ? "Clair" : "Celui de l’appareil";
  const facts: { label: string; value: string; href: string }[] = [
    { label: "Adresse mail", value: user.email, href: "/parametres/compte#adresse" },
    { label: "Double authentification", value: user.totpEnabled ? "Activée" : "Désactivée", href: "/parametres/compte#securite" },
    ...(user.level ? [{ label: "Année", value: `L${user.level}`, href: "/parametres/compte#licence" }] : []),
    { label: "Thème", value: theme, href: "/parametres/affichage#lecture" },
  ];
  return (
    <SettingsPage user={user} title="Paramètres">
      <div className="hidden gap-4 lg:grid">
        <Link href={sectionHref("profil")} aria-label="Modifier mon profil" className="block rounded-xl transition-shadow hover-ok:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <ProfileCard user={user} profile={profile} status={await visibleStatus(profile)} self compact badge={false} facts="Modifier ton profil et son apparence" />
        </Link>
        <dl className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
          {facts.map((f) => (
            <div key={f.label} className="relative flex min-h-12 items-center gap-4 px-4 py-2.5 transition-colors hover:bg-muted">
              <dt className="flex-1 text-sm text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 truncate text-sm font-semibold"><Link href={f.href} className="after:absolute after:inset-0 focus-visible:outline-none">{f.value}</Link></dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">Choisis une section dans la colonne de gauche, ou cherche un réglage par son nom.</p>
      </div>
      {groups.map((group) => (
        <section key={group} aria-labelledby={`groupe-${group}`} className="grid grid-cols-1 gap-2 lg:hidden">
          <h2 id={`groupe-${group}`} className="px-1 text-sm font-semibold text-muted-foreground">{group}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
            {sections.filter((s) => s.group === group).map((s) => (
              <li key={s.id}>
                <Link href={sectionHref(s.id)} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                  <Icon icon={s.icon} className="shrink-0 text-muted-foreground" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-sm text-muted-foreground text-pretty">{s.hint}</span>
                  </span>
                  <Icon icon={IconChevronRight} size={16} className="shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SettingsPage>
  );
}
