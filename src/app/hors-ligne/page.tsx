import type { Metadata } from "next";
import { IndependenceNotice } from "@/components/independence";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Hors ligne" };

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md px-4 pt-[14vh]">
      <Logo className="mb-8 h-7 w-auto" />
      <h1 className="display-2">Tu es hors ligne</h1>
      <p className="mt-1 text-muted-foreground">Cette page n’a pas été gardée. Une fois de retour en ligne, utilise « Garder hors ligne » sur tes cours pour les relire sans réseau.</p>
      <IndependenceNotice className="mt-8 text-sm text-muted-foreground" />
    </main>
  );
}
