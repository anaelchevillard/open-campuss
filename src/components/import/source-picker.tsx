"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/reui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CommandDialog, Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { IconExternal, IconGoogleDocs, IconNotion } from "@/lib/icons";
import type { Provider } from "./import-jobs";

export type PickerPage = { id: string; title: string; edited: string; icon: string | null; imported: boolean };
type Reply = { connected?: boolean; lost?: boolean; items?: PickerPage[]; next?: string | null; error?: string };

export const PROVIDER_LABEL: Record<Provider, string> = { notion: "Notion", google: "Google Docs" };
export const PROVIDER_ICON = { notion: IconNotion, google: IconGoogleDocs } as const;
export const startHref = (provider: Provider, returnTo: string) => `/api/connected/${provider}/start?retour=${encodeURIComponent(returnTo)}`;

/**
 * Le sélecteur : les pages les plus récentes d'abord, la recherche chez le service, Entrée importe.
 * Plein écran au téléphone. Un compte dont l'accès a été retiré propose de se reconnecter.
 */
export function SourcePicker({ provider, open, onOpenChange, returnTo, onPick }: { provider: Provider; open: boolean; onOpenChange: (open: boolean) => void; returnTo: string; onPick: (page: PickerPage) => void }) {
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState<{ key: string; items: PickerPage[]; next: string | null; lost: boolean; error: string | null } | null>(null);
  const [more, setMore] = useState(false);
  const asked = useRef("");
  useBackToClose(open, () => onOpenChange(false));

  useEffect(() => {
    if (!open) return;
    const key = `${provider}:${query.trim()}`;
    asked.current = key;
    // Laisser finir la frappe : une requête au service par pause, pas par lettre
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/connected/${provider}/pages?q=${encodeURIComponent(query.trim())}`).catch(() => null);
      const data = await response?.json().catch(() => null) as Reply | null;
      if (asked.current !== key) return;
      setReply({ key, items: data?.items ?? [], next: data?.next ?? null, lost: Boolean(data?.lost || data?.connected === false), error: response?.ok ? null : data?.error ?? "La liste n’a pas pu être lue. Réessaie dans un instant." });
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [open, provider, query]);

  async function loadMore() {
    if (!reply?.next) return;
    setMore(true);
    const data = await fetch(`/api/connected/${provider}/pages?q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(reply.next)}`).then((r) => r.json() as Promise<Reply>).catch(() => null);
    setMore(false);
    if (data?.items) setReply((old) => old && { ...old, items: [...old.items, ...data.items!.filter((item) => !old.items.some((o) => o.id === item.id))], next: data.next ?? null });
  }

  const loading = !reply || reply.key !== `${provider}:${query.trim()}`;
  const name = PROVIDER_LABEL[provider];
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={`Importer de ${name}`} description={`Choisis une page de ${name}`}
      className="max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-none! sm:max-w-xl">
      <Command shouldFilter={false} loop className="max-sm:h-full">
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <Icon icon={PROVIDER_ICON[provider]} className="text-muted-foreground" />
          <p className="text-sm font-semibold">Importer de {name}</p>
          <Button variant="ghost" size="sm" className="ml-auto sm:hidden" onClick={() => onOpenChange(false)}>Fermer</Button>
        </div>
        <CommandInput value={query} onValueChange={setQuery} placeholder={`Rechercher dans ${name}`} className="text-base sm:text-sm" />
        <CommandList className="max-h-[min(24rem,60dvh)] p-1 max-sm:max-h-none max-sm:flex-1">
          {loading && (
            <div aria-busy="true" className="grid gap-1 p-1">
              {[70, 55, 80, 45, 62].map((w) => <div key={w} className="flex h-11 items-center gap-3 px-2"><Skeleton className="size-5 rounded-sm" /><Skeleton className="h-3.5" style={{ width: `${w}%` }} /></div>)}
            </div>
          )}
          {!loading && reply.lost && (
            <div className="grid justify-items-center gap-3 px-4 py-8 text-center">
              <p className="text-sm">L’accès à {name} a été retiré ou a expiré</p>
              <a href={startHref(provider, returnTo)} data-slot="button" className={buttonVariants({ variant: "outline" })}>Reconnecter {name}</a>
            </div>
          )}
          {!loading && !reply.lost && reply.error && <p role="alert" className="px-4 py-8 text-center text-sm text-destructive">{reply.error}</p>}
          {!loading && !reply.lost && !reply.error && (
            <>
              <CommandEmpty>{query ? "Aucune page ne correspond" : "Aucune page"}</CommandEmpty>
              {reply.items.map((page) => (
                <CommandItem key={page.id} value={page.id} onSelect={() => onPick(page)} className="min-h-11 gap-3 px-2 coarse:min-h-12">
                  <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center text-base leading-none text-muted-foreground">
                    {page.icon ?? <Icon icon={PROVIDER_ICON[provider]} size={16} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base sm:text-sm">{page.title}</span>
                  {page.imported
                    ? <Badge variant="secondary" radius="full" className="shrink-0">Déjà importé</Badge>
                    : <span className="shrink-0 text-xs text-muted-foreground max-[420px]:hidden">{page.edited}</span>}
                </CommandItem>
              ))}
              {reply.next && <CommandItem value="__plus" onSelect={() => void loadMore()} className="min-h-11 justify-center text-muted-foreground">{more ? "Chargement…" : "Afficher plus"}</CommandItem>}
            </>
          )}
        </CommandList>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2 text-xs text-muted-foreground pb-safe">
          <span className="hidden items-center gap-1.5 fine:inline-flex"><Kbd>↵</Kbd> importer</span>
          {provider === "notion" && (
            <a href={startHref(provider, returnTo)} className="ml-auto inline-flex min-h-8 items-center gap-1 text-link underline-offset-4 hover:underline">
              Donner accès à d’autres pages<Icon icon={IconExternal} size={16} className="size-3.5" />
            </a>
          )}
        </div>
      </Command>
    </CommandDialog>
  );
}
