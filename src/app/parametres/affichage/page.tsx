import type { Metadata } from "next";
import { SettingsGroup } from "@/components/profile/settings/autosave";
import { InterfaceSettings } from "@/components/profile/settings/display-form";
import { SettingsPage } from "@/components/profile/settings/settings-page";
import { ReadingControls } from "@/components/reading-settings";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Affichage et lecture · Paramètres" };

/** Confort et accessibilité : rien ne se débloque ici, tout est libre. */
export default async function DisplaySettingsPage() {
  const user = await requireUser();
  return (
    <SettingsPage user={user} section="affichage">
      <div className="grid grid-cols-1 gap-8">
        <SettingsGroup id="lecture" title="Thème et lecture">
          <ReadingControls initial={user.prefs} />
        </SettingsGroup>
        <InterfaceSettings initial={user.prefs} />
      </div>
    </SettingsPage>
  );
}
