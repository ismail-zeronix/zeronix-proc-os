import { ImageResponse } from "next/og";

// The share picture for every page that has no cover of its own (BRAND.md colours: green, white, mint). Built once; no
// portal call, so it also works in the Docker build where the portal is not running. Uses the renderer's own font.
export const alt = "Zeronix Tech: business IT, matched to your industry";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#0f9d58";
const Z = "M12.5 12.5h15L12.5 27.5h15";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: GREEN, padding: "72px 80px", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="68" height="68" viewBox="0 0 40 40">
            <rect width="40" height="40" rx="10" fill="#ffffff" />
            <path d={Z} fill="none" stroke={GREEN} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>Zeronix</div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: 7, color: "rgba(255,255,255,0.8)" }}>TECHNOLOGY</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, lineHeight: 1.08, fontWeight: 700, display: "flex", flexWrap: "wrap", letterSpacing: -2 }}>
            Business IT, matched to&nbsp;<span style={{ color: "#d6f5e3" }}>your industry.</span>
          </div>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.85)" }}>UAE-stock laptops, desktops, workstations and servers, with B2B pricing.</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {["Business-grade only", "UAE warranty", "VAT invoices"].map((t) => (
            <div key={t} style={{ display: "flex", background: "#ffffff", color: "#0a8443", borderRadius: 12, padding: "10px 22px", fontSize: 24, fontWeight: 600 }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
