import { headers } from "next/headers";
import { AnnouncementLine, ViewBanner } from "@/components/admin/announcement-line";
import { currentUser } from "@/lib/auth";
import { announcementFor } from "@/lib/announcements";
import { recordViewPath } from "@/lib/impersonation";
import { VIEW_END_PATH } from "@/lib/impersonation-rules";

/**
 * Sous l'en-tête du Shell : le bandeau du « voir comme » (non masquable) ou l'annonce de l'administration.
 * Composant serveur ; une annonce illisible ne casse pas la page.
 */
export async function AnnouncementBar() {
  const user = await currentUser();
  if (!user) return null;
  if (user.viewing) {
    const path = (await headers()).get("x-campus-path");
    if (path) await recordViewPath(user.viewing.impersonationId, path).catch(() => undefined);
    return <ViewBanner name={user.name} expiresAt={user.viewing.expiresAt.toISOString()} action={`${VIEW_END_PATH}?retour=${encodeURIComponent(`/admin/personnes/${user.id}`)}`} />;
  }
  const announcement = await announcementFor(user).catch((error) => { console.error("bandeau d'annonce indisponible", error); return null; });
  if (!announcement) return null;
  return <AnnouncementLine id={announcement.id} body={announcement.body} href={announcement.href} tone={announcement.tone} dismissible={announcement.dismissible} />;
}
