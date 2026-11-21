import { z } from "zod";
import { isBot } from "@/lib/analytics-utils";
import { env } from "@/lib/env";
import { CLIENT_LIMITS, takeSlot, type Window } from "@/lib/errors/limit";
import { recordError } from "@/lib/errors/record";
import { isNoise, routeOf } from "@/lib/errors/scrub";
import { visitorAddress } from "@/lib/visitor";

const perIp: Window = new Map();
const site: Window = new Map();

const report = z.object({
  kind: z.enum(["error", "rejection", "react"]),
  name: z.string().max(200).default(""),
  message: z.string().max(2000).default(""),
  stack: z.string().max(12_000).default(""),
  path: z.string().max(500).default(""),
}).strict();

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * Erreurs du navigateur, envoyées par sendBeacon. Reçues avec ou sans accord à la mesure
 * d'audience (intérêt légitime : sécurité et bon fonctionnement du site), donc sans rien qui désigne la personne :
 * ni compte, ni cookie, ni identifiant d'appareil. Tout est nettoyé de nouveau ici. La réponse est toujours la même.
 */
export async function POST(request: Request) {
  const agent = request.headers.get("user-agent") ?? "";
  if (isBot(agent)) return done();
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > CLIENT_LIMITS.maxBodyBytes) return done();
  const ip = visitorAddress((name) => request.headers.get(name), env.trustedIpHeader);
  if (!takeSlot(perIp, ip || "?", CLIENT_LIMITS.perIpPerMinute, 60_000)) return done();
  if (!takeSlot(site, "site", CLIENT_LIMITS.sitePerMinute, 60_000)) return done();
  const text = await request.text().catch(() => "");
  if (text.length > CLIENT_LIMITS.maxBodyBytes) return done();
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    return done();
  }
  const parsed = report.safeParse(raw);
  if (!parsed.success || isNoise(parsed.data.message, parsed.data.stack)) return done();
  const { kind, name, message, stack, path } = parsed.data;
  await recordError({
    source: "client", name: kind === "rejection" && !name ? "UnhandledRejection" : name, message, stack, route: routeOf(path), userAgent: agent, ip,
  }).catch((error) => console.error("erreur du navigateur non enregistrée", error instanceof Error ? error.message : error));
  return done();
}
