import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { pageContainer } from "@/components/page-container";
import { Footer, Shell } from "@/components/shell";
import { currentUser } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/db/categories";

/** Pages publiques : un enseignant ou un visiteur sans compte doit pouvoir les lire ; connecté, on garde la navigation de l'application. */
export async function LegalShell({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  const user = await currentUser();
  const body = (
    <>
      <h1 className="display-2">{title}</h1>
      {updated && <p className="mt-1 text-muted-foreground">Dernière mise à jour : {updated}</p>}
      <div className="legal mt-6">{children}</div>
    </>
  );
  // Seul un compte qui a fini d'entrer voit la coquille ; les autres (CGU à accepter, accueil) restent sur la page nue
  if (user && !user.mustChangePassword && user.termsVersion === TERMS_VERSION && (user.onboardedAt || user.role === "admin" || user.role === "teacher")) {
    return <Shell user={user}>{body}</Shell>;
  }
  return (
    <>
      <header className="border-b border-border bg-card"><div className={`${pageContainer("standard", { spacing: false })} py-3`}>
        {/* <a> et non next/link : « / » se charge en entier, avec sa CSP (WebAssembly du téléphone 3D) */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète voulue */}
        <a href="/" className="inline-block rounded-sm"><Logo className="h-6 w-auto" /></a></div></header>
      <main className={`page-enter flex-1 ${pageContainer()}`}>{body}</main>
      <Footer />
    </>
  );
}
