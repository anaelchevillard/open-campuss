import { NextResponse } from "next/server";
import { realUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { endView } from "@/lib/impersonation";
import { HOME } from "@/lib/home";

/** Seule écriture permise pendant un aperçu (proxy.ts) : y mettre fin et revenir à la fiche. */
export async function POST(request: Request) {
  const admin = await realUser();
  if (admin) await endView(admin);
  const back = new URL(request.url).searchParams.get("retour") ?? "";
  const target = /^\/admin\/personnes\/[0-9a-f-]{36}$/.test(back) ? back : "/admin/personnes";
  return NextResponse.redirect(new URL(admin?.role === "admin" ? target : HOME, env.baseUrl), 303);
}
