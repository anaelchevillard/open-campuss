"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/icon";
import { IconMore } from "@/lib/icons";

/** Ce qui sert rarement sort de la barre : un seul bouton « … ». */
export function DocMoreMenu({ items }: { items: { href: string; label: string }[] }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Autres actions" title="Autres actions" />}><Icon icon={IconMore} className="size-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {items.map((item) => <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>{item.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
