import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { RevisionSettings } from "@/components/revise/revision-settings";
import { SettingsPage } from "@/components/profile/settings/settings-page";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { DEFAULT_DAILY_GOAL } from "@/lib/study-habits";

export const metadata: Metadata = { title: "Révision" };

export default async function RevisionSettingsPage() {
  const user = await requireUser();
  const [[habits], [profile]] = await Promise.all([
    db.select().from(schema.userHabits).where(eq(schema.userHabits.userId, user.id)),
    db.select({ privacy: schema.userProfiles.privacy }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id)),
  ]);
  return (
    <SettingsPage user={user} section="revision">
      <div className="grid grid-cols-1 gap-8">
        <RevisionSettings
          goal={habits?.dailyGoal ?? DEFAULT_DAILY_GOAL} reminderHour={habits?.reminderHour ?? null} vacationUntil={habits?.vacationUntil ?? null}
          prefs={{ hideGame: user.prefs.hideGame, sounds: user.prefs.sounds, haptics: user.prefs.haptics }} privacy={profile?.privacy ?? {}}
        />
      </div>
    </SettingsPage>
  );
}
