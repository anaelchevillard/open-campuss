import type { ReactNode } from "react";
import { cn } from "cn";
import { PageTitle } from "@/components/page-title";

/**
 * En-tête de page : un titre (.title), l'action principale à droite, les onglets dessous. Pas de chapeau qui répète le titre.
 * `lead` reste pour une phrase vraiment utile.
 */
export function PageHeader({ title, lead, action, tabs, shortTitle, className }: { title: ReactNode; lead?: ReactNode; action?: ReactNode; tabs?: ReactNode; shortTitle?: string; className?: string }) {
  const text = shortTitle ?? (typeof title === "string" ? title : "");
  return (
    <header className={cn("mb-8 grid gap-4", className)}>
      {text && <PageTitle title={text} />}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="title wrap-break-word">{title}</h1>
          {lead && <p className="mt-2 max-w-[62ch] text-pretty text-muted-foreground">{lead}</p>}
        </div>
        {/* max-w-full : au téléphone, les actions passent à la ligne au lieu de pousser contre le bord droit */}
        {action && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {tabs}
    </header>
  );
}

/** Ancien nom, gardé le temps de la refonte. */
export function PageHead({ title, lead, action }: { title: ReactNode; lead?: ReactNode; action?: ReactNode }) {
  return <PageHeader title={title} lead={lead} action={action} />;
}
