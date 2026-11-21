"use client";

import { savePrefs } from "@/app/actions/social";
import type { Prefs } from "@/lib/prefs";
import { AutoSwitch } from "./autosave";

/** Sons et vibrations : coupés par défaut. La vibration n'existe que sur Android. */
export function SoundSettings({ initial }: { initial: Prefs }) {
  const save = (patch: Partial<Prefs>) => savePrefs(patch).then(() => ({ ok: true as const }));
  return (
    <>
      <AutoSwitch label="Sons" description="Trois sons courts : réponse juste, série, badge" checked={Boolean(initial.sounds)} onSave={(v) => save({ sounds: v || undefined })} />
      <AutoSwitch label="Vibrations" description="Sur Android, une vibration brève" checked={Boolean(initial.haptics)} onSave={(v) => save({ haptics: v || undefined })} />
    </>
  );
}
