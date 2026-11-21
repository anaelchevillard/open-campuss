import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/** Ancienne adresse de la personnalisation : le profil se modifie sur le profil lui-même, en direct. */
export default async function PersonalizeSettings() {
  const user = await requireUser();
  redirect(`/u/${user.id}?modifier=1&depuis=parametres`);
}
