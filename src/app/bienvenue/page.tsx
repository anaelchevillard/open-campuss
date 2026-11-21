import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { requireUserAny } from "@/lib/auth";
import { HOME } from "@/lib/home";

export const metadata: Metadata = { title: "Bienvenue" };

export default async function WelcomePage() {
  const user = await requireUserAny();
  if (user.onboardedAt) redirect(HOME);
  return <Onboarding name={user.name} friendCode={user.friendCode} initialIntent={user.prefs.intent} />;
}
