import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const original = process.env.AUTH_SECRET;
beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
});
afterEach(() => {
  process.env.AUTH_SECRET = original;
});

describe("secret encryption", () => {
  it("round-trips and never stores the plain text", () => {
    const token = encryptSecret("p@ss w0rd ✓");
    expect(token).not.toContain("p@ss");
    expect(decryptSecret(token)).toBe("p@ss w0rd ✓");
  });

  it("uses a fresh IV, so the same password encrypts differently each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects a tampered value", () => {
    const [iv, tag, data] = encryptSecret("secret").split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptSecret([iv, tag, flipped.toString("base64")].join("."))).toThrow();
    expect(() => decryptSecret("garbage")).toThrow();
  });

  it("cannot be read after AUTH_SECRET changes", () => {
    const token = encryptSecret("secret");
    process.env.AUTH_SECRET = "a-different-secret-entirely";
    expect(() => decryptSecret(token)).toThrow();
  });

  it("refuses to work without a proper AUTH_SECRET", () => {
    process.env.AUTH_SECRET = "short";
    expect(() => encryptSecret("x")).toThrow(/AUTH_SECRET/);
  });
});
