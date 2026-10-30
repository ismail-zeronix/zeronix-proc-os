import { describe, expect, it } from "vitest";
import { describeDevice } from "@/lib/webchat/device";

describe("describeDevice", () => {
  it("reads an iPhone", () => {
    const d = describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1");
    expect(d).toEqual({ type: "Phone", model: "iPhone", os: "iOS 17.4", browser: "Safari 17" });
  });

  it("takes the model and OS version from Android client hints", () => {
    const d = describeDevice("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", {
      hints: { mobile: true, model: "SM-S918B", platformVersion: "14.0.0", brands: ["Google Chrome 130", "Chromium 130"] },
    });
    expect(d).toEqual({ type: "Phone", model: "SM-S918B", os: "Android 14", browser: "Chrome 130" });
  });

  it("reads the model from an older Android user agent", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 9; SM-T510 Build/PPR1) AppleWebKit/537.36 Chrome/90.0 Safari/537.36").model).toBe("SM-T510");
  });

  it("tells Windows 11 from 10 by the client hints", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
    expect(describeDevice(ua, { hints: { platformVersion: "15.0.0" } })).toMatchObject({ type: "Desktop", os: "Windows 11", browser: "Edge 130" });
    expect(describeDevice(ua, { hints: { platformVersion: "10.0.0" } }).os).toBe("Windows 10");
  });

  it("spots an iPad asking for the desktop site", () => {
    const d = describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", { touchPoints: 5 });
    expect(d).toMatchObject({ type: "Tablet", model: "iPad", os: "iPadOS" });
  });
});
