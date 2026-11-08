/**
 * Makes a platform admin (the ZeronixOS Platform console, /platform), or gives one a new authenticator secret.
 * Never from the web: run it on the server, where only the operator can.
 *
 *   npm run platform-admin -- add   --email you@zeronix.ae --name "Your Name"
 *   npm run platform-admin -- reset --email you@zeronix.ae          (new password and new authenticator secret)
 *   npm run platform-admin -- off   --email you@zeronix.ae          (can no longer sign in)
 *   in the production image: node scripts/platform-admin.js add --email ... --name ...
 *
 * Prints the password (random, unless PLATFORM_ADMIN_PASSWORD is set) and the authenticator secret with its otpauth://
 * link: add it to an authenticator app now, it is not shown again. Uses PLATFORM_DATABASE_URL, else DATABASE_URL.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { encryptSecret } from "../src/lib/crypto";
import { newTotpSecret, totpUri } from "../src/lib/totp";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? "") : "";
}

async function main() {
  const cmd = process.argv[2];
  const email = arg("email").trim().toLowerCase();
  if (!["add", "reset", "off"].includes(cmd ?? "") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: platform-admin add|reset|off --email you@example.com [--name "Your Name"]');
    process.exit(2);
  }
  const url = process.env.PLATFORM_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set PLATFORM_DATABASE_URL (or DATABASE_URL)");
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    if (cmd === "off") {
      const r = await db.query("UPDATE platform_admins SET is_active = false, session_version = session_version + 1 WHERE email = $1", [email]);
      console.log(r.rowCount ? `${email} can no longer sign in to the platform console.` : `No platform admin ${email}.`);
      return;
    }
    const password = process.env.PLATFORM_ADMIN_PASSWORD || randomBytes(15).toString("base64url");
    if (password.length < 12) throw new Error("PLATFORM_ADMIN_PASSWORD must be at least 12 characters");
    const secret = newTotpSecret();
    const hash = await bcrypt.hash(password, 12);
    if (cmd === "add") {
      const name = arg("name").trim() || email;
      await db.query("INSERT INTO platform_admins (name, email, password_hash, totp_secret) VALUES ($1, $2, $3, $4)", [name, email, hash, encryptSecret(secret)]);
    } else {
      const r = await db.query(
        "UPDATE platform_admins SET password_hash = $2, totp_secret = $3, last_totp_step = 0, is_active = true, session_version = session_version + 1 WHERE email = $1",
        [email, hash, encryptSecret(secret)],
      );
      if (!r.rowCount) throw new Error(`No platform admin ${email}`);
    }
    console.log(`\nPlatform admin ${email} ${cmd === "add" ? "created" : "reset"}.`);
    if (!process.env.PLATFORM_ADMIN_PASSWORD) console.log(`Password:              ${password}`);
    console.log(`Authenticator secret:  ${secret}`);
    console.log(`Authenticator link:    ${totpUri(secret, email)}`);
    console.log("\nAdd the secret to an authenticator app now (it is not shown again), then sign in at /platform.\n");
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
