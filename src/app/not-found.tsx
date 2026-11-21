import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { HOME } from "@/lib/home";

export default function NotFound() {
  return <PublicShell title="Page introuvable" intro="Cette page n’existe pas, ou tu n’y as pas accès."><Link className="text-[var(--link)] underline underline-offset-2" href={HOME}>Retour à l’accueil</Link></PublicShell>;
}
