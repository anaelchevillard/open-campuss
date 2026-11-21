import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/**
 * Le profil se modifie sur le profil lui-même, en direct. Une ancre (« Réseaux » trouvé par la recherche) suit
 * en paramètre `ancre` : un #fragment se perd dans la redirection d'une navigation côté client.
 */
export default async function ProfileSettings({ searchParams }: PageProps<"/parametres/profil">) {
  const user = await requireUser();
  const anchor = (await searchParams).ancre;
  const keep = typeof anchor === "string" && /^[a-z-]{1,20}$/.test(anchor) ? `&ancre=${anchor}` : "";
  redirect(`/u/${user.id}?modifier=1&depuis=parametres${keep}`);
}
