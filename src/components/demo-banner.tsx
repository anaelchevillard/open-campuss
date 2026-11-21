import { DEMO_NOTICE, isDemo } from "@/lib/demo";

/** Bande discrète en tête de chaque page de l'instance de démonstration. */
export function DemoBanner() {
  if (!isDemo()) return null;
  return (
    <p role="note" className="border-b border-border bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground">
      {DEMO_NOTICE}
    </p>
  );
}
