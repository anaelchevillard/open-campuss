"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { IconEye, IconHidden } from "@/lib/icons";

/** Mot de passe avec un bouton œil pour afficher ce qu'on tape. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-11", className)} autoCapitalize="none" spellCheck={false} />
      <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <Icon icon={shown ? IconHidden : IconEye} size={16} />
      </button>
    </div>
  );
}
