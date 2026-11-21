/** Règles pures de blocage d'un compte à la connexion (testées sans base). */

export type AccessState = {
  status: string; suspendedUntil: Date | null; suspensionMessage: string | null;
  provisionalExpiresAt: Date | null; mustChangePassword: boolean; deletionScheduledAt: Date | null;
};

export function isSuspended(user: Pick<AccessState, "suspendedUntil">, now = new Date()) {
  return Boolean(user.suspendedUntil && user.suspendedUntil > now);
}

/** Null si le compte peut entrer ; sinon le message montré à la personne (qui connaît déjà son mot de passe). */
export function accessRefusal(user: AccessState, now = new Date()): string | null {
  if (user.status === "banned") return "Ce compte a été fermé par l’équipe de Campuss.";
  if (user.deletionScheduledAt) return "Ce compte est en cours de suppression. Écris-nous pour l’annuler.";
  if (isSuspended(user, now)) {
    const until = user.suspendedUntil!.toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
    return `Ton compte est suspendu jusqu’au ${until}.${user.suspensionMessage ? ` ${user.suspensionMessage}` : ""}`;
  }
  if (user.mustChangePassword && user.provisionalExpiresAt && user.provisionalExpiresAt < now) return "Ce mot de passe provisoire a expiré. Demande un nouveau lien à l’équipe, ou utilise « Mot de passe oublié ».";
  return null;
}

export const SUSPENSION_PRESETS = { "24h": 86_400_000, "7j": 7 * 86_400_000, "30j": 30 * 86_400_000 } as const;

export function suspensionEnd(preset: keyof typeof SUSPENSION_PRESETS | "date", date: string | null, now = new Date()): Date | null {
  if (preset !== "date") return new Date(now.getTime() + SUSPENSION_PRESETS[preset]);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const end = new Date(`${date}T23:59:00+01:00`);
  return Number.isNaN(end.getTime()) || end <= now ? null : end;
}

/** Mot de passe provisoire : 4 mots courants, lisibles au téléphone, séparés par des tirets. */
const WORDS = [
  "abricot", "balcon", "cerise", "dauphin", "erable", "falaise", "girafe", "hibou", "iris", "jardin", "kiwi", "lagune", "marelle", "neige", "olive", "papaye",
  "quartz", "renard", "sapin", "tulipe", "union", "velours", "wagon", "yaourt", "zebre", "ardoise", "brioche", "citron", "domino", "etoile", "fougere", "grenade",
  "harpe", "igloo", "jasmin", "koala", "lavande", "mangue", "noisette", "orage", "pivoine", "quiche", "riviere", "saphir", "tamis", "vanille", "violon", "zinnia",
  "amande", "bambou", "canoe", "dune", "ecume", "figue", "galet", "hamac", "ivoire", "jonquille", "lapin", "mouette", "nuage", "orange", "prairie", "rocher",
];

export function provisionalPassword(random: (max: number) => number) {
  return Array.from({ length: 4 }, () => WORDS[random(WORDS.length)]).join("-") + `-${10 + random(90)}`;
}
