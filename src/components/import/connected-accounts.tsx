"use client";

import { useState, useTransition } from "react";
import { disconnectProvider, setWeekly } from "@/app/actions/connected";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/reui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { IconDone, IconPublished, IconWarning } from "@/lib/icons";
import { toast, toastError } from "@/lib/toast";
import type { Provider } from "./import-jobs";
import { PROVIDER_ICON, PROVIDER_LABEL, startHref } from "./source-picker";

export type ConnectedAccount = { provider: Provider; connected: boolean; broken: boolean; label: string; weekly: boolean };

function Saved({ at }: { at: number }) {
  return at ? <span key={at} className="inline-flex items-center gap-1 text-xs text-muted-foreground motion-ok:animate-rise"><Icon icon={IconDone} size={16} className="size-3.5 text-success" />Enregistré</span> : null;
}

function AccountRow({ account, returnTo, weeklySwitch }: { account: ConnectedAccount; returnTo: string; weeklySwitch: boolean }) {
  const [weekly, setWeeklyState] = useState(account.weekly);
  const [saved, setSaved] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const name = PROVIDER_LABEL[account.provider];
  const id = `weekly-${account.provider}`;

  const toggle = (on: boolean) => {
    setWeeklyState(on);
    start(async () => {
      const result = await setWeekly(account.provider, on).catch(() => ({ error: "L’enregistrement a échoué." }));
      if (result.error) { setWeeklyState(!on); toastError(result.error); } else setSaved(Date.now());
    });
  };

  return (
    <Item variant="outline" className="items-start bg-card">
      <ItemMedia className="size-10 rounded-xl bg-muted text-foreground"><Icon icon={PROVIDER_ICON[account.provider]} /></ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap text-base">
          {name}
          {account.connected && (account.broken
            ? <Badge variant="warning-light" radius="full" className="gap-1"><Icon icon={IconWarning} size={16} className="size-3.5" />À reconnecter</Badge>
            : <Badge variant="success-light" radius="full" className="gap-1"><Icon icon={IconPublished} size={16} className="size-3.5" />Connecté</Badge>)}
        </ItemTitle>
        {account.connected && account.label && <ItemDescription className="truncate">{account.label}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        {!account.connected || account.broken
          ? <a href={startHref(account.provider, returnTo)} data-slot="button" className={buttonVariants({ variant: "outline" })}>{account.broken ? "Reconnecter" : "Connecter"}</a>
          : <Button variant="ghost" onClick={() => setConfirm(true)}>Déconnecter</Button>}
      </ItemActions>
      {weeklySwitch && account.connected && !account.broken && (
        <ItemFooter className="basis-full justify-start gap-3 border-t pt-3">
          <Switch id={id} checked={weekly} onCheckedChange={toggle} disabled={pending} />
          <Label htmlFor={id} className="text-sm font-normal">Me proposer mes nouvelles notes chaque semaine</Label>
          <Saved at={saved} />
        </ItemFooter>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Déconnecter ${name} ?`} confirmLabel="Déconnecter"
        description="Campuss perd tout accès. Tes cours déjà importés restent."
        onConfirm={async () => {
          const { revoked } = await disconnectProvider(account.provider).catch(() => ({ revoked: false }));
          setConfirm(false);
          toast(revoked ? `${name} est déconnecté` : `${name} est déconnecté de notre côté`, revoked ? undefined : { description: `Retire aussi Campuss dans les réglages de ton compte ${name}.`, duration: 8000 });
        }} />
    </Item>
  );
}

/** Une ligne par service configuré. Le même composant sert aux paramètres et à l'éditeur. */
export function ConnectedAccounts({ accounts, returnTo, weeklySwitch = true }: { accounts: ConnectedAccount[]; returnTo: string; weeklySwitch?: boolean }) {
  return (
    <ItemGroup className="gap-3">
      {accounts.map((account) => <AccountRow key={account.provider} account={account} returnTo={returnTo} weeklySwitch={weeklySwitch} />)}
    </ItemGroup>
  );
}
