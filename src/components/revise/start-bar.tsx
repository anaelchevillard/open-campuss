"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

/**
 * Bouton « Commencer » de la séance du jour. Il est d'abord dans la carte ; au téléphone, une copie collée en bas
 * (au-dessus des onglets) n'apparaît qu'une fois ce bouton sorti de l'écran, pour ne jamais cacher les quêtes et
 * leurs paliers quand la carte est visible.
 */
export function StartButton({ href, label }: { href: string; label: string }) {
  const inline = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const node = inline.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setAway(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div ref={inline}>
        <Link href={href} data-slot="button" className={cn(buttonVariants({ size: "lg" }), "w-full md:w-auto md:min-w-56")}>{label}</Link>
      </div>
      <div aria-hidden={!away} inert={!away}
        className={cn("fixed inset-x-0 bottom-[var(--bottom-offset)] z-(--z-sticky) bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-4 pb-3 transition-opacity duration-(--dur-base) md:hidden", away ? "opacity-100" : "pointer-events-none opacity-0")}>
        <Link href={href} data-slot="button" className={cn(buttonVariants({ size: "lg" }), "w-full shadow-md")} tabIndex={away ? undefined : -1}>{label}</Link>
      </div>
    </>
  );
}
