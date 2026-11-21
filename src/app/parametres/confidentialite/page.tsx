import { withVisibleNames } from "@/lib/user-name";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { SettingsGroup } from "@/components/profile/settings/autosave";
import { BlockedList, ShareLinks, VisibilitySettings } from "@/components/profile/settings/privacy-form";
import { SettingsPage } from "@/components/profile/settings/settings-page";
import { ConsentLink } from "@/components/tracker";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { profileOf } from "@/lib/profile-data";
import { featureOn } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Confidentialité · Paramètres" };

const CONSENT = { yes: "Mesure d’audience acceptée", no: "Mesure d’audience refusée" } as Record<string, string>;

export default async function PrivacySettings() {
  const user = await requireUser();
  // « Voir comme » : la sécurité, les blocages et les notifications restent privés
  if (user.viewing) notFound();
  const [profile, blocked, links, rankingOn] = await Promise.all([
    profileOf(user.id),
    db.select({ id: schema.users.id, name: schema.users.name, avatarKey: schema.users.avatarKey }).from(schema.userBlocks)
      .innerJoin(schema.users, eq(schema.userBlocks.blockedId, schema.users.id)).where(eq(schema.userBlocks.blockerId, user.id)),
    db.selectDistinctOn([schema.shareLinks.documentId], { documentId: schema.shareLinks.documentId, title: schema.documents.title }).from(schema.shareLinks)
      .innerJoin(schema.documents, eq(schema.shareLinks.documentId, schema.documents.id))
      .where(and(eq(schema.shareLinks.createdBy, user.id), isNull(schema.shareLinks.revokedAt))).orderBy(schema.shareLinks.documentId, desc(schema.shareLinks.createdAt)),
    featureOn("ranking"),
  ]);
  return (
    <SettingsPage user={user} section="confidentialite">
      <div className="grid grid-cols-1 gap-8">
        <VisibilitySettings privacy={profile?.privacy ?? {}} ranking={user.showInRanking} rankingOn={rankingOn} />
        <BlockedList people={await withVisibleNames(user, blocked)} />
        <ShareLinks links={links.map((l) => ({ documentId: l.documentId, title: l.title || "Sans titre" }))} />
        <SettingsGroup id="suivi" title="Suivi des pages">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>{CONSENT[user.trackingConsent ?? ""] ?? "Pas encore choisi"}</span>
            <span className="font-semibold text-link"><ConsentLink /></span>
          </div>
        </SettingsGroup>
      </div>
    </SettingsPage>
  );
}
