import { describe, expect, it } from "vitest";
import { contactsFromDraft, contactsIn, isBot, isDomain, networkKind, visitorHeat, type HeatInput } from "@/lib/webchat/qualify";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

describe("isBot", () => {
  it("lets real browsers through", () => {
    expect(isBot(CHROME)).toBe(false);
    expect(isBot(IPHONE)).toBe(false);
    expect(isBot("Mozilla/5.0 (Linux; Android 12; CUBOT KingKong 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe(false);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]")).toBe(false);
  });

  it("stops search engines, SEO tools, previews and scripted browsers", () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0 A",
      "python-requests/2.31.0",
      "curl/8.4.0",
      "",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
  });
});

describe("networkKind", () => {
  it("tells company networks from home internet and data centres", () => {
    expect(networkKind("Emirates NBD Bank PJSC")).toBe("business");
    expect(networkKind("Emirates Telecommunications Group Company (Etisalat Group) PJSC")).toBe("isp");
    expect(networkKind("Emirates Integrated Telecommunications Company PJSC")).toBe("isp");
    expect(networkKind("Amazon.com, Inc.", "Amazon Technologies Inc.")).toBe("hosting");
    expect(networkKind("OVH SAS")).toBe("hosting");
    expect(networkKind("Google LLC")).toBe("hosting");
    expect(networkKind(undefined)).toBeNull();
  });
});

describe("contactsIn", () => {
  it("finds a UAE mobile and an email in a message", () => {
    expect(contactsIn("Please call me on 050 123 4567 or mail Ahmed@Acme.ae thanks")).toEqual({ phone: "050 123 4567", email: "ahmed@acme.ae" });
    expect(contactsIn("whatsapp +971 50 123 4567")).toEqual({ phone: "+971 50 123 4567" });
    expect(contactsIn("my number is 00971501234567")).toEqual({ phone: "00971501234567" });
  });

  it("ignores prices, quantities, dates and model numbers", () => {
    expect(contactsIn("I need 25 laptops at 3,499 AED each")).toEqual({});
    expect(contactsIn("delivery by 2026-11-05 please")).toEqual({});
    expect(contactsIn("ThinkPad 21HD0049AD in stock?")).toEqual({});
  });
});

describe("contactsFromDraft", () => {
  it("follows a number while it is still being typed, so the last digit is not lost", () => {
    const first = contactsFromDraft("call me on 050 123 45", "call me on 050 123 456", { email: "", phone: "" });
    expect(first).toEqual({ phone: "050 123 456" });
    expect(contactsFromDraft("call me on 050 123 456", "call me on 050 123 4567", { email: "", phone: "050 123 456" })).toEqual({ phone: "050 123 4567" });
  });

  it("follows an email the same way", () => {
    expect(contactsFromDraft("ahmed@gmail.co", "ahmed@gmail.com", { email: "ahmed@gmail.co", phone: "" })).toEqual({ email: "ahmed@gmail.com" });
  });

  it("never overwrites what they typed into the form", () => {
    expect(contactsFromDraft("hello", "call 050 123 4567 or a@b.ae", { email: "real@acme.ae", phone: "0559999999" })).toEqual({});
  });

  it("keeps the details when the text is deleted", () => {
    expect(contactsFromDraft("050 123 4567", "", { email: "", phone: "050 123 4567" })).toEqual({});
  });
});

describe("isDomain", () => {
  it("takes real domains only", () => {
    expect(isDomain("acme.ae")).toBe(true);
    expect(isDomain("mail.acme-group.co.uk")).toBe(true);
    for (const bad of ["%.com", "x(.com", "acme", "a_b.com", ".com", "acme.", "", "a b.com", ".*"]) expect(isDomain(bad), bad).toBe(false);
  });
});

describe("visitorHeat", () => {
  const base: HeatInput = { lead: false, partial: false, client: null, pages: [], asked: false, network: null, events: [] };

  it("is cold for a first look", () => {
    const h = visitorHeat({ ...base, pages: [{ url: "https://www.zeronix.ae/", title: "", at: "" }] });
    expect(h.level).toBe("cold");
    expect(h.reasons).toEqual([]);
  });

  it("is at least warm once there is a way to reach them", () => {
    expect(visitorHeat({ ...base, partial: true }).level).toBe("warm");
    expect(visitorHeat({ ...base, lead: true }).level).toBe("warm");
  });

  it("is hot for a returning company visitor who clicked to call", () => {
    const h = visitorHeat({
      ...base,
      partial: true,
      client: { visits: 3 },
      network: "business",
      countryCode: "AE",
      events: [{ kind: "call", label: "+971 4 000 0000", url: "tel:+97140000000", at: "" }],
    });
    expect(h.level).toBe("hot");
    expect(h.reasons).toContain("Clicked to call, WhatsApp or email");
    expect(h.reasons).toContain("On a company network");
  });

  it("counts a data-centre network against, and never goes below 0", () => {
    const h = visitorHeat({ ...base, network: "hosting" });
    expect(h.score).toBe(0);
    expect(h.reasons).toContain("Data-centre network (VPN or bot)");
  });
});
