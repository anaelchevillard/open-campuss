import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { NotificationSettings } from "@/components/notification-settings";
import { SettingsGroup } from "@/components/profile/settings/autosave";
import { SettingsPage } from "@/components/profile/settings/settings-page";
import { SoundSettings } from "@/components/profile/settings/sound-form";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { IconChevronRight, IconRevise } from "@/lib/icons";
import { notificationMailEnabled, weeklyMailEnabled } from "@/lib/notification-state";

export const metadata: Metadata = { title: "Notifications · Paramètres" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const [weekly, notificationMail] = env.smtpEnabled ? await Promise.all([weeklyMailEnabled(user.id), notificationMailEnabled(user.id)]) : [null, null];
  const canNotify = env.pushEnabled || env.smtpEnabled;
  return (
    <SettingsPage user={user} section="notifications">
      <div className="grid grid-cols-1 gap-8">
        {canNotify && (
          <SettingsGroup title="Canaux" description="Au plus un rappel par jour ; le reste t’attend dans la cloche">
            <NotificationSettings pushKey={env.pushEnabled ? env.vapidPublicKey : null} weeklyMail={weekly} notificationMail={notificationMail} />
          </SettingsGroup>
        )}
        {user.role !== "teacher" && (
          <SettingsGroup title="Rappels">
            <Link href="/parametres/revision" className="-m-2 flex min-h-11 items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted">
              <Icon icon={IconRevise} className="text-muted-foreground" />
              <span className="flex-1 font-semibold">Rappel de révision</span>
              <span className="text-sm text-muted-foreground">{user.prefs.hideGame ? "" : "Heure, vacances"}</span>
              <Icon icon={IconChevronRight} size={16} className="text-muted-foreground" />
            </Link>
          </SettingsGroup>
        )}
        <SettingsGroup id="sons" title="Sons et vibrations">
          <SoundSettings initial={user.prefs} />
        </SettingsGroup>
      </div>
    </SettingsPage>
  );
}
