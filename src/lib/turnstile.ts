import "server-only";
import { env } from "./env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

/**
 * Vérifie le jeton Turnstile côté serveur. Sans clés, le captcha n'existe pas (true). Avec clés : jeton absent,
 * refusé ou Cloudflare injoignable = refus.
 */
export async function turnstilePassed(token: string, ip: string): Promise<boolean> {
  if (!env.turnstileEnabled) return true;
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: env.turnstileSecretKey, response: token, ...(ip ? { remoteip: ip } : {}) });
    const response = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.warn("turnstile :", (error as Error).message);
    return false;
  }
}
