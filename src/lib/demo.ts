/**
 * Instance de démonstration (`DEMO_MODE=1`) : un compte étudiant partagé par tous les visiteurs, des données fictives
 * remises à zéro chaque nuit. Ce qui toucherait l'identité du compte, sa sécurité, ses données personnelles, des mails,
 * l'IA ou de gros fichiers est refusé ici, côté serveur : masquer un bouton ne suffit pas.
 * Module sans dépendance serveur : le proxy, les actions, les routes et les tests s'en servent.
 */

/** Identifiants publics du compte de démonstration (scripts/seed-demo.ts, README). */
export const DEMO_EMAIL = "lina_morel@etu.exemple.fr";
export const DEMO_PASSWORD = "vitrine-demo-campuss-2026";

export const DEMO_NOTICE = "Démo : données fictives, remises à zéro chaque nuit";
export const DEMO_REFUSAL = "Désactivé dans la démo : le compte est partagé et les données sont fictives.";

/** Plafond d'un fichier envoyé sur la démo : les images d'un cours passent, pas un PDF de cours entier. */
export const DEMO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const DEMO_UPLOAD_REFUSAL = "Fichier trop lourd pour la démo (2 Mo maximum).";

/** Lu à chaque appel : le mode se règle dans l'environnement du conteneur, jamais au build. */
export function isDemo(): boolean {
  const value = (process.env.DEMO_MODE ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

/** Pour une action à formulaire : `{ error }` sur la démo, sinon null. */
export function demoFormRefusal(): { error: string } | null {
  return isDemo() ? { error: DEMO_REFUSAL } : null;
}

/** Pour une action qui renvoie `{ ok, error }`. */
export function demoSaveRefusal(): { ok: false; error: string } | null {
  return isDemo() ? { ok: false, error: DEMO_REFUSAL } : null;
}

const refusal = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** Pour une route d'API : 403 sur la démo, sinon null. */
export function demoApiRefusal(): Response | null {
  return isDemo() ? refusal(DEMO_REFUSAL, 403) : null;
}

/** Envoi de fichier : refusé sur la démo au-delà de DEMO_UPLOAD_MAX_BYTES (taille annoncée ou reçue). */
export function demoUploadRefusal(size: number | string | null | undefined): Response | null {
  if (!isDemo()) return null;
  const bytes = Number(size ?? 0);
  return Number.isFinite(bytes) && bytes <= DEMO_UPLOAD_MAX_BYTES ? null : refusal(DEMO_UPLOAD_REFUSAL, 413);
}
