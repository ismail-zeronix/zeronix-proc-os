import type { WebClientInfo } from "./types";

/** What kind of device a website visitor is on, from the browser's user agent and (Chrome, Edge, Android) its client hints. */
export interface DeviceView {
  type: "Phone" | "Tablet" | "Desktop";
  /** "SM-S918B", "iPhone", "iPad", "Pixel 8"; empty for most computers. */
  model: string;
  /** "Android 14", "iOS 17.4", "Windows 11", "macOS". */
  os: string;
  /** "Chrome 130", "Safari 17", "Edge 129". */
  browser: string;
}

const major = (v: string | undefined) => (v ? v.split(".")[0] : "");

function browserOf(ua: string, hints?: WebClientInfo["hints"]): string {
  const m = (re: RegExp) => ua.match(re)?.[1];
  if (/Edg(e|A|iOS)?\//.test(ua)) return `Edge ${major(m(/Edg(?:e|A|iOS)?\/([\d.]+)/))}`.trim();
  if (/OPR\//.test(ua)) return `Opera ${major(m(/OPR\/([\d.]+)/))}`.trim();
  if (/SamsungBrowser\//.test(ua)) return `Samsung Internet ${major(m(/SamsungBrowser\/([\d.]+)/))}`.trim();
  if (/CriOS\//.test(ua)) return `Chrome ${major(m(/CriOS\/([\d.]+)/))}`.trim();
  if (/FxiOS\//.test(ua)) return `Firefox ${major(m(/FxiOS\/([\d.]+)/))}`.trim();
  if (/Firefox\//.test(ua)) return `Firefox ${major(m(/Firefox\/([\d.]+)/))}`.trim();
  if (/Chrome\//.test(ua)) {
    const brand = hints?.brands?.find((b) => !/Chromium/i.test(b));
    return brand ? brand.replace(/^Google /, "").replace(/(\d+)\..*$/, "$1") : `Chrome ${major(m(/Chrome\/([\d.]+)/))}`.trim();
  }
  if (/Safari\//.test(ua)) return `Safari ${major(m(/Version\/([\d.]+)/))}`.trim();
  return ua ? "Other browser" : "";
}

function osOf(ua: string, hints?: WebClientInfo["hints"]): string {
  const pv = hints?.platformVersion;
  if (/iPhone|iPod/.test(ua)) return `iOS ${(ua.match(/OS ([\d_]+)/)?.[1] ?? "").replace(/_/g, ".")}`.trim();
  if (/iPad/.test(ua)) return `iPadOS ${(ua.match(/OS ([\d_]+)/)?.[1] ?? "").replace(/_/g, ".")}`.trim();
  if (/Android/.test(ua)) return `Android ${pv ? major(pv) : (ua.match(/Android ([\d.]+)/)?.[1] ?? "")}`.trim();
  // Windows 11 still says "Windows NT 10.0"; its client hints say 13 or higher
  if (/Windows/.test(ua)) return pv ? (Number(major(pv)) >= 13 ? "Windows 11" : "Windows 10") : "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X/.test(ua)) return pv ? `macOS ${major(pv)}` : "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}

export function describeDevice(ua: string, client?: WebClientInfo | null): DeviceView {
  const hints = client?.hints;
  // an iPad asking for the desktop site says "Macintosh", but has a touch screen
  const ipadAsMac = /Macintosh/.test(ua) && (client?.touchPoints ?? 0) > 1;
  let model = hints?.model || "";
  if (!model) {
    if (/iPhone/.test(ua)) model = "iPhone";
    else if (/iPad/.test(ua) || ipadAsMac) model = "iPad";
    else {
      // older Android user agents name the model; newer ones say just "K"
      const a = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)?.[1]?.trim();
      if (a && a !== "K") model = a;
    }
  }
  const mobile = hints?.mobile ?? /Mobi|iPhone|iPod/.test(ua);
  const tablet = !mobile && (/iPad|Tablet/.test(ua) || ipadAsMac || (/Android/.test(ua) && !/Mobile/.test(ua)));
  return {
    type: mobile ? "Phone" : tablet ? "Tablet" : "Desktop",
    model,
    os: ipadAsMac ? "iPadOS" : osOf(ua, hints),
    browser: browserOf(ua, hints),
  };
}
