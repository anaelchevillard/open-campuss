"use client";

import dynamic from "next/dynamic";

/**
 * Le conteneur des messages (sonner) n'est pas dans le JavaScript du premier affichage : il arrive juste après. Un
 * message lancé avant son arrivée n'est pas perdu, sonner le rejoue à l'abonnement du conteneur.
 */
const Toaster = dynamic(() => import("@/components/ui/sonner").then((mod) => mod.Toaster), { ssr: false });

export function LazyToaster() {
  return <Toaster />;
}
