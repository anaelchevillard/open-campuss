import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../env";
import { safeEqualText, type StatePayload, encodeState, decodeState } from "./rules";

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
// Mêmes principes que totp-secret.ts, avec des clés dérivées à part
const derive = (info: string) => Buffer.from(hkdfSync("sha256", env.secretKey, Buffer.alloc(0), info, 32));

export function sealToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive("campuss:oauth-tokens:v1"), iv, { authTagLength: 16 });
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", b64(iv), b64(cipher.getAuthTag()), b64(data)].join(":");
}

export function openToken(stored: string) {
  const [version, iv, tag, data, ...rest] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data || rest.length) throw new Error("jeton : format inconnu");
  const decipher = createDecipheriv("aes-256-gcm", derive("campuss:oauth-tokens:v1"), Buffer.from(iv, "base64url"), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

const signature = (body: string) => createHmac("sha256", derive("campuss:oauth-state:v1")).update(body).digest("base64url");

/** Signé et lié au compte : le retour d'un autre compte, ou un retour fabriqué, ne relie rien ici. */
export function signState(payload: Omit<StatePayload, "nonce" | "expires">, now = Date.now()) {
  const body = encodeState({ ...payload, nonce: randomBytes(12).toString("base64url"), expires: now + 10 * 60_000 });
  return `${body}.${signature(body)}`;
}

export function verifyState(value: string, now = Date.now()): StatePayload | null {
  const [body, sent, ...rest] = value.split(".");
  if (!body || !sent || rest.length || !safeEqualText(sent, signature(body))) return null;
  const payload = decodeState(body);
  return payload && payload.expires > now ? payload : null;
}
