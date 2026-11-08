import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, newTotpSecret, totpCode, totpStep, verifyTotp } from "@/lib/totp";

// RFC 6238 appendix B: the secret "12345678901234567890" (ASCII), SHA-1, 8 digits; the last 6 digits are the 6-digit code
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP codes", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpCode(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpCode(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totpCode(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("round-trips base32", () => {
    const b = Buffer.from("hello platform");
    expect(base32Decode(base32Encode(b)).toString()).toBe("hello platform");
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("accepts the current code once, a step either side, and nothing else", () => {
    const secret = newTotpSecret();
    const now = Date.now();
    const step = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), 0, now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), 0, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 3), 0, now)).toBeNull();
    // already used: the same code cannot sign in again
    expect(verifyTotp(secret, totpCode(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, "12345", 0, now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", 0, now)).toBeNull();
  });
});
