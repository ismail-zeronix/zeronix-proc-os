import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encrypts small secrets (mailbox passwords) with AES-256-GCM. The key comes from AUTH_SECRET, so the
 * database alone does not reveal them. If AUTH_SECRET is changed, saved passwords can no longer be read
 * and the person has to enter them again.
 */
function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return scryptSync(secret, "zeronix-secrets-v1", 32);
}

/** Returns "iv.tag.data" in base64. A fresh random IV is used every time. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(token: string): string {
  const [iv, tag, data] = token.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("Stored secret is damaged");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
