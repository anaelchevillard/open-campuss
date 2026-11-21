import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { changePassword, confirmTotp, deleteOwnAccount, disableTotp, requestEmailChange, revokeOneSession, revokeOtherSessions, startTotp } from "@/app/actions/account";
import { ActionForm, Notice } from "@/components/action-form";
import { Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { SettingsGroup } from "@/components/profile/settings/autosave";
import { LevelChoice } from "@/components/profile/settings/level-choice";
import { SettingsPage } from "@/components/profile/settings/settings-page";
import { AddPasskey, RecoveryCodes } from "@/components/security-client";
import { Submit } from "@/components/submit";
import { buttonVariants } from "@/components/ui/button";
import { aiGrowth } from "@/lib/ai-quota";
import { aiUsage } from "@/lib/ai-quota-server";
import { aiAvailable } from "@/lib/ai-available";
import { browserOf, deviceOf } from "@/lib/analytics-utils";
import { requireUserAny, SESSION_COOKIE } from "@/lib/auth";
import { listPrograms } from "@/lib/catalog";
import { MIN_PASSWORD } from "@/lib/constants";
import { db, schema } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/documents";
import { isDemo } from "@/lib/demo";
import { env } from "@/lib/env";
import { POINTS } from "@/lib/gamification";
import { IconDownload, IconLaptop, IconPhone } from "@/lib/icons";
import { tokenHash } from "@/lib/security";
import { formatQuota } from "@/lib/storage-quota";
import { storageUsedBy } from "@/lib/storage-usage";
import { readTotpSecret } from "@/lib/totp-secret";

export const metadata: Metadata = { title: "Compte et sécurité · Paramètres" };

const deviceLabel = (agent: string) => (agent ? `${browserOf(agent)}, ${deviceOf(agent)}` : "Appareil inconnu");
const isPhone = (agent: string) => /mobile|android|iphone/i.test(agent);

/** Ce qui reste explicite : adresse, mot de passe, 2FA et suppression demandent une confirmation. */
export default async function AccountSettings({ searchParams }: PageProps<"/parametres/compte">) {
  const user = await requireUserAny();
  // « Voir comme » : la sécurité, les blocages et les notifications restent privés
  if (user.viewing) notFound();
  // Démonstration : compte partagé. Les actions de cette page sont refusées côté serveur ; la liste des sessions
  // montrerait les appareils et adresses IP des autres visiteurs
  if (isDemo()) {
    return (
      <SettingsPage user={user} section="compte">
        <div className="grid grid-cols-1 gap-8">
          <Notice tone="info">Sur la démo, le mot de passe, l’adresse, la double authentification, les appareils, l’export et la suppression du compte ne se modifient pas : ce compte est partagé par tous les visiteurs.</Notice>
          {user.role !== "admin" && (
            <SettingsGroup id="licence" title="Année" description="Les cours affichés suivent l’année choisie">
              <LevelChoice level={user.level ?? 1} />
            </SettingsGroup>
          )}
        </div>
      </SettingsPage>
    );
  }
  const strongRequired = (await searchParams).securite === "1";
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const [devices, keys, [codes], storageUsed, programs, ai] = await Promise.all([
    db.select().from(schema.sessions).where(and(eq(schema.sessions.userId, user.id), eq(schema.sessions.mfaPending, false))).orderBy(desc(schema.sessions.lastSeenAt)),
    db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id)),
    db.select({ n: count() }).from(schema.recoveryCodes).where(and(eq(schema.recoveryCodes.userId, user.id), isNull(schema.recoveryCodes.usedAt))),
    storageUsedBy(user.id),
    listPrograms(),
    aiAvailable().then((on) => (on ? aiUsage(user) : null)),
  ]);
  const aiNext = ai && user.role !== "admin" ? aiGrowth("pages", ai.credits, POINTS.cours) : "";
  const program = programs.find((p) => p.id === user.programId);
  let qr: string | null = null;
  const totpSecret = user.totpEnabled ? null : readTotpSecret(user.totpSecret);
  if (totpSecret) {
    const uri = new TOTP({ issuer: env.siteName, label: user.email, secret: Secret.fromBase32(totpSecret) }).toString();
    qr = await QRCode.toDataURL(uri, { margin: 2, width: 200 });
  }
  return (
    <SettingsPage user={user} section="compte">
      <div className="grid grid-cols-1 gap-8">
        {strongRequired && <Notice tone="info">Ton rôle demande un second facteur : active la double authentification ou ajoute une clé d’accès.</Notice>}
        {user.mustChangePassword && <Notice tone="info">Ce mot de passe est provisoire : remplace-le pour accéder au site.</Notice>}

        <SettingsGroup id="mot-de-passe" title="Mot de passe" description="Tes autres appareils seront déconnectés">
          <ActionForm action={changePassword}>
            <Field label="Mot de passe actuel" name="current" type="password" autoComplete="current-password" required />
            <Field label="Nouveau mot de passe" hint={` (${MIN_PASSWORD} caractères au moins)`} name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required />
            <div><Submit variant="outline">Changer le mot de passe</Submit></div>
          </ActionForm>
        </SettingsGroup>

        <SettingsGroup id="adresse" title="Adresse mail" description={user.email}>
          <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
            <li>Indique ta nouvelle adresse et ton mot de passe.</li>
            <li>Un lien de confirmation part vers la <span className="font-semibold text-foreground">nouvelle</span> adresse ; ouvre-le dans les 24 heures.</li>
            <li>L’adresse change à ce moment-là. D’ici là, l’actuelle reste valable.</li>
          </ol>
          {user.pendingEmail && <p role="status" className="rounded-lg bg-muted p-3 text-sm">En attente de confirmation : <span className="font-semibold">{user.pendingEmail}</span>. Ouvre le mail reçu sur cette adresse (regarde aussi les indésirables).</p>}
          {!env.smtpEnabled && <p role="status" className="rounded-lg bg-warning-tint p-3 text-sm text-warning-foreground">L’envoi de mails n’est pas encore en service : le changement d’adresse est impossible pour l’instant. Écris à l’équipe depuis la page Aide.</p>}
          <ActionForm action={requestEmailChange}>
            <Field label="Nouvelle adresse" name="email" type="email" autoComplete="email" required />
            <Field label="Mot de passe, pour confirmer" name="current" id="current-email" type="password" autoComplete="current-password" required />
            <div><Submit variant="outline">Changer d’adresse</Submit></div>
          </ActionForm>
        </SettingsGroup>

        {user.role !== "admin" && (
          <SettingsGroup id="licence" title="Licence" description={program?.name ?? "Aucune licence"}>
            <LevelChoice level={user.level ?? 1} />
            <p className="text-sm text-muted-foreground">Pour changer de licence, écris à un administrateur.</p>
          </SettingsGroup>
        )}

        <SettingsGroup id="securite" title="Double authentification" description={user.totpEnabled ? "Active : un code est demandé à chaque connexion" : "Protège ton compte, même si ton mot de passe fuite"}>
          {user.totpEnabled ? (
            <ActionForm action={disableTotp}>
              <Field label="Mot de passe, pour confirmer" name="current" type="password" autoComplete="current-password" required />
              <div><Submit variant="outline">Désactiver</Submit></div>
            </ActionForm>
          ) : qr ? (
            <>
              <p className="text-sm">Scanne ce code avec ton application (Aegis, Vaultwarden…), puis saisis le code affiché.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code de configuration" width={200} height={200} className="rounded-lg bg-white" />
              <p className="text-sm text-muted-foreground">Clé manuelle : <code className="break-all">{totpSecret}</code></p>
              <ActionForm action={confirmTotp}>
                <Field label="Code à 6 chiffres" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
                <div><Submit>Activer</Submit></div>
              </ActionForm>
            </>
          ) : (
            <form action={startTotp}><Submit variant="outline">Configurer</Submit></form>
          )}
        </SettingsGroup>

        <SettingsGroup id="cles" title="Clés d’accès" description="Empreinte, visage ou clé physique, sans mot de passe">
          {keys.length > 0 && <ul className="divide-y divide-border">{keys.map((k) => <li key={k.credentialId} className="py-2 text-sm"><span className="font-semibold">{k.name}</span><span className="text-muted-foreground"> · ajoutée le {formatDate(k.createdAt)}</span></li>)}</ul>}
          <AddPasskey />
        </SettingsGroup>

        {(user.totpEnabled || keys.length > 0) && (
          <SettingsGroup id="codes" title="Codes de secours" description="Pour te connecter si tu perds ton téléphone">
            <RecoveryCodes remaining={codes.n} />
          </SettingsGroup>
        )}

        <SettingsGroup id="appareils" title="Appareils et sessions" description="Un mail t’arrive à chaque nouvel appareil">
          <ul className="-my-2 divide-y divide-border">
            {devices.map((d) => {
              const current = token && d.tokenHash === tokenHash(token);
              return (
                <li key={d.tokenHash} className="flex flex-wrap items-center gap-3 py-3">
                  <Icon icon={isPhone(d.userAgent) ? IconPhone : IconLaptop} className="text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{deviceLabel(d.userAgent)}{current && <span className="ml-2 font-normal text-success-foreground">cet appareil</span>}</span>
                    <span className="text-sm text-muted-foreground">{d.ip && `${d.ip} · `}actif le {formatDateTime(d.lastSeenAt)}</span>
                  </span>
                  {!current && <form action={revokeOneSession}><input type="hidden" name="session" value={d.tokenHash} /><Submit size="sm" variant="outline">Déconnecter</Submit></form>}
                </li>
              );
            })}
          </ul>
          {devices.length > 1 && <form action={revokeOtherSessions}><Submit variant="ghost">Déconnecter tous mes autres appareils</Submit></form>}
        </SettingsGroup>

        {ai && (
          <SettingsGroup id="ia" title="Campuss IA" description="Le compteur repart chaque jour à minuit">
            <ul className="divide-y divide-border text-sm">
              <li className="flex justify-between gap-4 py-2"><span>Pages à transcrire</span><span className="tabular-nums text-muted-foreground">{ai.left.pages} sur {ai.allowance.pages}</span></li>
              <li className="flex justify-between gap-4 py-2"><span>Générations de fiches</span><span className="tabular-nums text-muted-foreground">{ai.left.memo} sur {ai.allowance.memo}</span></li>
            </ul>
            {aiNext && <p className="text-sm text-muted-foreground">Pour en avoir plus : {aiNext}</p>}
          </SettingsGroup>
        )}

        <SettingsGroup id="donnees" title="Données">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{storageUsed ? formatQuota(storageUsed) : "Aucun fichier"}{user.role === "admin" ? "" : ` sur ${formatQuota(env.storageQuotaBytes)}`}</span>
            <a href="/api/account/export" download data-slot="button" className={buttonVariants({ variant: "outline" })}><Icon icon={IconDownload} size={16} />Exporter mes données</a>
          </div>
          <p className="text-sm text-muted-foreground">Voir la <Link className="text-link underline underline-offset-2" href="/confidentialite">politique de confidentialité</Link></p>
        </SettingsGroup>

        <SettingsGroup id="supprimer" title="Supprimer le compte" description="Ton compte, ta photo et tes badges disparaissent. Les cours publiés restent, sans ton nom.">
          <ActionForm action={deleteOwnAccount} confirm="Le compte sera supprimé définitivement.">
            <Field label="Mot de passe, pour confirmer" name="current" id="current-delete" type="password" autoComplete="current-password" required />
            <div><Submit variant="outline" className="text-destructive-foreground">Supprimer mon compte</Submit></div>
          </ActionForm>
        </SettingsGroup>
      </div>
    </SettingsPage>
  );
}
