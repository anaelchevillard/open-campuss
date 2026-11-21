import type { ReactNode } from "react";
import { cn } from "cn";
import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import type { User } from "@/lib/db/schema";
import { SettingsNav } from "./settings-nav";
import { SECTIONS, sectionsFor, type SectionId } from "./sections";

import { SaveScope } from "@/components/save-guard";
import { SETTINGS_MAIN } from "./placement";

/**
 * Mise en page commune des paramètres : liste à gauche sur ordinateur, contenu au centre (40rem).
 * Tout réglage modifié attend « Enregistrer » (SaveScope), avec garde de sortie.
 * Au téléphone et sur tablette en portrait, la page s'ouvre depuis Moi ; le retour de l'en-tête y ramène.
 * Sans `section` : l'accueil des paramètres (aucune entrée active dans la colonne).
 * Les sections d'autres lots (Révision, Comptes connectés) s'y logent en remplaçant `<Shell user>` par `<SettingsPage user section>`.
 */
export function SettingsPage({ user, section, children, title }: { user: User; section?: SectionId; children: ReactNode; title?: string }) {
  const current = SECTIONS.find((s) => s.id === section);
  const allowed = sectionsFor(user.role, true).map((s) => s.id);
  return (
    <Shell user={user}>
      <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-6 lg:gap-x-10 lg:gap-y-6", "lg:grid-cols-[15rem_minmax(0,40rem)]")}>
        <aside className="hidden lg:sticky lg:top-20 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:block lg:self-start">
          <SettingsNav allowed={allowed} />
        </aside>
        <div className="settings-sub order-1 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1">
          <PageHeader title={title ?? current?.label ?? "Paramètres"} className="mb-0" />
        </div>
        <div className={SETTINGS_MAIN}><SaveScope>{children}</SaveScope></div>
      </div>
    </Shell>
  );
}
