import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "./env";

const PREFIX = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

// Une clé propre à cet usage, dérivée : SECRET_KEY sert aussi à signer, et ne doit pas chiffrer directement
const key = () => Buffer.from(hkdfSync("sha256", env.secretKey, Buffer.alloc(0), "campuss:totp-secret:v1", 32));

/** `v1:iv:tag:données` en base64url : AES-256-GCM. */
export function sealTotpSecret(plain: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv, { authTagLength: TAG_BYTES });
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [PREFIX, b64(iv), b64(cipher.getAuthTag()), b64(data)].join(":");
}

/** Lève une erreur si la valeur a été altérée. Une valeur sans « : » est un ancien secret en clair (base32), pendant la transition. */
export function openTotpSecret(stored: string) {
  if (!stored.includes(":")) return stored;
  const [version, iv, tag, data, ...rest] = stored.split(":");
  if (version !== PREFIX || !iv || !tag || !data || rest.length) throw new Error("secret TOTP : format inconnu");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"), { authTagLength: TAG_BYTES });
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Pour les écrans et la connexion : un secret indéchiffrable (SECRET_KEY changée) vaut un code faux, pas une erreur 500. */
export function readTotpSecret(stored: string | null) {
  if (!stored) return null;
  try {
    return openTotpSecret(stored);
  } catch (error) {
    console.error("secret TOTP illisible :", (error as Error).message);
    return null;
  }
}
