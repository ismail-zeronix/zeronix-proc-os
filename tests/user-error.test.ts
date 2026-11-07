import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorText, parseInput, UserError } from "@/lib/user-error";

const GENERIC = /Something went wrong/;

describe("messages that survive a production build", () => {
  it("carries the words in the digest, where React lets them through", () => {
    const e = new UserError("This invoice was cancelled.");
    expect(e.digest).toBe("This invoice was cancelled.");
    expect(e.message).toBe("This invoice was cancelled.");
    expect(e).toBeInstanceOf(Error);
  });

  it("reads the words of a refusal the way the browser receives it in production", () => {
    const fromServer = Object.assign(new Error("Minified React error #441; visit https://react.dev/errors/441"), { digest: "Only AED 60 is left to apply." });
    expect(errorText(fromServer)).toBe("Only AED 60 is left to apply.");
  });

  it("shows an unexpected error plainly, with nothing from inside the system", () => {
    expect(errorText(Object.assign(new Error("Minified React error #441"), { digest: "1234567890" }))).toMatch(GENERIC);
    expect(errorText(new Error("An error occurred in the Server Components render. The specific message is omitted in production builds"))).toMatch(GENERIC);
    expect(errorText(undefined)).toMatch(GENERIC);
    expect(errorText({})).toMatch(GENERIC);
  });

  it("keeps a real message in development and for errors from the browser itself", () => {
    expect(errorText(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  it("gives the first validation problem as one sentence", () => {
    const s = z.object({ why: z.string().min(3, "Say why"), n: z.number() });
    expect(parseInput(s, { why: "abcd", n: 1 })).toEqual({ why: "abcd", n: 1 });
    expect(() => parseInput(s, { why: "a", n: 1 })).toThrow("Say why");
    try {
      parseInput(s, { why: "a", n: 1 });
    } catch (e) {
      expect(e).toBeInstanceOf(UserError);
      expect((e as UserError).digest).toBe("Say why");
    }
  });
});
