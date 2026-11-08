import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encrypts small secrets (mailbox passwords, API keys) with AES-256-GCM, so the database alone does not reveal them.
 *
 * Two keys, told apart by the stored value:
 * - DATA_KEY (when set): its own key, used for everything saved from now on. Stored as "k2.iv.tag.data". Changing
 *   AUTH_SECRET (which signs the sign-in cookies) then no longer touches saved secrets.
 * - AUTH_SECRET: older values ("iv.tag.data"), and new ones while DATA_KEY is not set, so nothing breaks on the way.
 * If the key a value was saved with changes, that value can no longer be read and has to be entered again.
 */
const cache = new Map<string, Buffer>();

function derive(secret: string, salt: string): Buffer {
  const id = `${salt}:${secret}`;
  let k = cache.get(id);
  if (!k) cache.set(id, (k = scryptSync(secret, salt, 32)));
  return k;
}

function legacyKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return derive(secret, "zeronix-secrets-v1");
}

function dataKey(): Buffer | null {
  const secret = process.env.DATA_KEY;
  if (!secret) return null;
  if (secret.length < 32) throw new Error("DATA_KEY is too short (use at least 32 characters, e.g. openssl rand -base64 32)");
  return derive(secret, "zeronix-data-key-v2");
}

function seal(key: Buffer, plain: string): string[] {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64"));
}

function open(key: Buffer, parts: string[]): string {
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64"));
  if (parts.length !== 3 || !iv?.length || !tag?.length || !data) throw new Error("Stored secret is damaged");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** A fresh random IV every time: "k2.iv.tag.data" with DATA_KEY, else "iv.tag.data" with AUTH_SECRET. */
export function encryptSecret(plain: string): string {
  const k = dataKey();
  return k ? ["k2", ...seal(k, plain)].join(".") : seal(legacyKey(), plain).join(".");
}

export function decryptSecret(token: string): string {
  const parts = token.split(".");
  if (parts[0] === "k2") {
    const k = dataKey();
    if (!k) throw new Error("This secret was saved with DATA_KEY, which is not set");
    return open(k, parts.slice(1));
  }
  return open(legacyKey(), parts);
}
