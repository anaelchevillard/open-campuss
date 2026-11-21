import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { ConnectedAccounts } from "@/components/import/connected-accounts";
import { ConnectedProposals } from "@/components/import/connected-proposals";
import { ConnectionResult } from "@/components/import/connection-result";
import { SettingsGroup } from "@/components/profile/settings/autosave";
import { SettingsPage } from "@/components/profile/settings/settings-page";
import { requireUser } from "@/lib/auth";
import { PROVIDER_NAMES } from "@/lib/connected/providers";
import { CONNECTED_PAGE, isProvider, MAX_NEW_PER_PASS } from "@/lib/connected/rules";
import { accountsOf, importProviders } from "@/lib/connected/status";
import { db, schema } from "@/lib/db";
import { IconChevronRight, IconLaptop, IconPasskey, IconSecurity, type IconData } from "@/lib/icons";

export const metadata: Metadata = { title: "Comptes connectés" };

const { connectedFolders, connectedItems, passkeys, sessions } = schema;

/** Une ligne de « Connexion à Campuss » : ce qui est en place, et le lien vers l'endroit où le changer. */
function SignInRow({ href, icon, label, value }: { href: string; icon: IconData; label: string; value: string }) {
  return (
    <li>
      <Link href={href} className="-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
        <Icon icon={icon} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 font-semibold">{label}</span>
        <span className="text-right text-sm text-muted-foreground">{value}</span>
        <Icon icon={IconChevronRight} size={16} className="shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

/**
 * Comptes connectés : la connexion à Campuss (clés d'accès, double authentification, appareils), toujours,
 * puis une ligne par service d'import configuré (Google Drive, Notion). Un service sans clé, ou des imports
 * coupés par l'administration, n'y figure pas (rien de grisé).
 */
export default async function ConnectedAccountsPage({ searchParams }: PageProps<"/parametres/comptes-connectes">) {
  const user = await requireUser();
  // « Voir comme » : la sécurité reste privée
  if (user.viewing) notFound();
  const providers = await importProviders();
  const { resultat, service } = await searchParams;
  const [accounts, [keys], [devices]] = await Promise.all([
    accountsOf(user.id, providers),
    db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, user.id)),
    db.select({ n: count() }).from(sessions).where(and(eq(sessions.userId, user.id), eq(sessions.mfaPending, false))),
  ]);
  const folders = providers.length ? await db.select({ id: connectedFolders.id, provider: connectedFolders.provider }).from(connectedFolders).where(eq(connectedFolders.userId, user.id)) : [];
  const items = folders.length ? await db.select({ id: connectedItems.id, title: connectedItems.title, folderId: connectedItems.folderId }).from(connectedItems)
    .where(and(inArray(connectedItems.folderId, folders.map((f) => f.id)), eq(connectedItems.status, "proposed"))).orderBy(desc(connectedItems.foundAt)).limit(MAX_NEW_PER_PASS * 2) : [];
  const proposals = items.flatMap((item) => {
    const provider = folders.find((f) => f.id === item.folderId)?.provider;
    return provider ? [{ id: item.id, title: item.title, provider }] : [];
  });
  return (
    <SettingsPage user={user} section="comptes-connectes">
      <ConnectionResult result={typeof resultat === "string" ? resultat : null} name={isProvider(service) ? PROVIDER_NAMES[service] : null} />
      <div className="grid grid-cols-1 gap-8">
        <SettingsGroup id="connexion" title="Connexion à Campuss">
          <ul className="grid gap-1">
            <SignInRow href="/parametres/compte#cles" icon={IconPasskey} label="Clés d’accès" value={keys.n ? `${keys.n} clé${keys.n > 1 ? "s" : ""}` : "Aucune"} />
            <SignInRow href="/parametres/compte#securite" icon={IconSecurity} label="Double authentification" value={user.totpEnabled ? "Active" : "Inactive"} />
            <SignInRow href="/parametres/compte#appareils" icon={IconLaptop} label="Appareils connectés" value={String(devices.n)} />
          </ul>
        </SettingsGroup>
        {accounts.length > 0 && (
          <section aria-labelledby="services" className="grid gap-3">
            <div>
              <h2 id="services" className="heading">Services reliés</h2>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">Pour importer tes notes dans Campuss, en lecture seule.</p>
            </div>
            <ConnectedAccounts accounts={accounts} returnTo={CONNECTED_PAGE} />
          </section>
        )}
        {proposals.length > 0 && (
          <section aria-labelledby="nouvelles-notes" className="grid gap-4">
            <h2 id="nouvelles-notes" className="heading">Nouvelles notes <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{proposals.length}</span></h2>
            <ConnectedProposals items={proposals} />
          </section>
        )}
      </div>
    </SettingsPage>
  );
}
