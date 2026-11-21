import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, strictTransportSecurity, WASM_PATHS } from "@/lib/csp";
import { isDemo } from "@/lib/demo";
import { isIndexablePath } from "@/lib/indexable";
import { isHiddenInPreview, VIEW_COOKIE, VIEW_END_PATH, VIEW_HIDDEN_PATH } from "@/lib/impersonation-rules";

const SESSION_COOKIE = "__Host-campus";
const ANONYMOUS_BODY_LIMIT = 64 * 1024;
const SESSION_BODY_LIMIT = 17 * 1024 * 1024;
const PRIVATE_PAGE = "private, no-store, max-age=0";

const BASE_URL = () => process.env.BASE_URL ?? "https://campuss.fr";
const BASE_ORIGIN = () => new URL(BASE_URL()).origin;

function refuse(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/**
 * Défenses transversales uniquement : CSRF, taille des requêtes, en-têtes.
 * Les autorisations sont vérifiées dans chaque page et chaque action, jamais ici.
 */
export function proxy(request: NextRequest) {
  const contentOrigin = process.env.CONTENT_ORIGIN?.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const response = guard(request, host, contentOrigin);
  const hsts = strictTransportSecurity(host, BASE_URL(), contentOrigin);
  if (hsts) response.headers.set("Strict-Transport-Security", hsts);
  // Doublon voulu de next.config : les réponses du proxy (redirections, refus) et les routes servies sans lui restent hors des moteurs
  // La démonstration reste entièrement hors des moteurs
  if (isDemo() || !isIndexablePath(request.nextUrl.pathname)) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function guard(request: NextRequest, host: string, contentOrigin: string | undefined) {
  const { pathname } = request.nextUrl;
  // Origine séparée pour le contenu importé : elle ne sert rien d'autre, et le site ne le sert plus lui-même
  if (contentOrigin) {
    const onContentHost = host === new URL(contentOrigin).host;
    // /embed : les artefacts insérés comme blocs dans un cours
    const isContent = /^\/(view|vendor|embed)\//.test(pathname);
    if (onContentHost && !isContent) return refuse("Introuvable", 404);
    if (!onContentHost && /^\/(view|embed)\//.test(pathname)) return refuse("Introuvable", 404);
  }
  // Un en-tête interne de Next ne doit jamais venir de l'extérieur (CVE-2025-29927)
  if (request.headers.has("x-middleware-subrequest")) return refuse("Requête refusée", 400);

  // Un partage depuis le téléphone est reçu par le service worker, sans rien envoyer ici (public/sw.js). S'il n'est pas
  // actif, ce POST sans origine arrive quand même : on renvoie vers la zone de dépôt, sans lire le corps ni rien changer.
  if (pathname === "/partage" && request.method === "POST") return NextResponse.redirect(new URL("/contribuer/nouveau?importer=1", BASE_URL()), 303);

  // « Voir comme » : lecture seule stricte. Toute écriture et toute action serveur sont refusées ici, et de nouveau
  // par requireUser côté serveur ; les espaces privés de la personne sont remplacés par « Masqué en aperçu ».
  const viewing = request.cookies.has(VIEW_COOKIE);
  if (viewing) {
    const write = !["GET", "HEAD", "OPTIONS"].includes(request.method) || request.headers.has("next-action");
    if (write && pathname !== VIEW_END_PATH) return refuse("Aperçu en lecture seule", 403);
    if (!write && isHiddenInPreview(pathname)) return NextResponse.redirect(new URL(`${VIEW_HIDDEN_PATH}?depuis=${encodeURIComponent(pathname)}`, BASE_URL()), 303);
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    // Next laisse passer une action sans Origin : ici, toute requête navigateur doit être de même origine.
    // « Origin: null » (contenu sandboxé) est aussi refusé.
    if (origin !== null ? origin !== BASE_ORIGIN() : fetchSite !== null && fetchSite !== "same-origin") {
      return refuse("Origine refusée", 403);
    }
    const length = request.headers.get("content-length");
    if (length === null || !/^\d+$/.test(length)) return refuse("Longueur requise", 411);
    const limit = request.cookies.has(SESSION_COOKIE) ? SESSION_BODY_LIMIT : ANONYMOUS_BODY_LIMIT;
    if (Number(length) > limit) return refuse("Envoi trop volumineux", 413);
  }

  // Le contenu importé et les fichiers portent leur propre politique, posée par leur route
  if (/^\/(view|embed|files|notion-asset|avatars|vendor|content)\//.test(pathname)) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const turnstile = Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
  const csp = contentSecurityPolicy({ nonce, dev: process.env.NODE_ENV === "development", baseUrl: BASE_URL(), contentOrigin, turnstile, wasm: WASM_PATHS.includes(pathname) });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  if (viewing) requestHeaders.set("x-campus-path", pathname);
  else requestHeaders.delete("x-campus-path");
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // « / » est publique mais change avec la session (« Ouvrir Campuss » au lieu de l'inscription) : jamais gardée par un
  // cache partagé (Cloudflare, proxy), qui servirait la version d'une personne connectée à la suivante
  if (pathname === "/") {
    response.headers.set("Cache-Control", PRIVATE_PAGE);
    response.headers.set("Vary", "Cookie");
  }
  return response;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|favicon.ico).*)" }],
};
