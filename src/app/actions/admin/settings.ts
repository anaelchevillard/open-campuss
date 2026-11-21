"use server";

import { revalidatePath } from "next/cache";
import { adminFor, isStepUp, reasonOf, type AdminResult } from "@/lib/admin-ops";
import { auditAction } from "@/lib/audit";
import { forgetAllShellCounters } from "@/lib/shell-cache";
import { getSetting, setSetting, SETTING_KEYS, type SettingKey } from "@/lib/site-settings";

/**
 * Un réglage du site (sensible, journalisé avec l'ancienne et la nouvelle valeur). Fermer les inscriptions est critique.
 * null = retour à la valeur par défaut.
 */
export async function saveSetting(key: SettingKey, value: unknown, reason: string): Promise<AdminResult> {
  if (!SETTING_KEYS.includes(key)) return { error: "Réglage inconnu." };
  const closing = key === "registration.mode" && value === "closed";
  const admin = await adminFor(closing ? "critical" : "sensitive");
  if (isStepUp(admin)) return admin;
  const motive = reasonOf(reason);
  let clean = value;
  if (Array.isArray(value)) clean = [...new Set(value.map((v) => String(v).trim().toLowerCase().replace(/^@/, "")).filter(Boolean))].slice(0, 200);
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 1_000_000)) return { error: "Valeur hors limites." };
  if (typeof value === "string") clean = value.trim().slice(0, 500);
  const before = await getSetting(key);
  try {
    await setSetting(key, clean as never, admin.id);
  } catch {
    return { error: "Valeur invalide." };
  }
  await auditAction(admin, { action: closing ? "inscriptions.fermees" : "reglage.modifie", target: { type: "setting", id: key, label: key }, reason: motive, before: { value: before }, after: { value: clean } });
  forgetAllShellCounters();
  revalidatePath("/", "layout");
  return {};
}
