import { ImageResponse } from "next/og";

// The share picture for every page that has no cover of its own (BRAND.md colours). Built once; no portal call, so it
// also works in the Docker build where the portal is not running. Uses the renderer's own font (it cannot read woff2).
export const alt = "Zeronix Tech: business IT, matched to your industry";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#081A31", padding: "72px 80px", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#2BD9A0", color: "#081A31", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 700 }}>Z</div>
          <div style={{ fontSize: 36, fontWeight: 600 }}>Zeronix Tech</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, fontWeight: 500, display: "flex", flexWrap: "wrap" }}>
            Business IT, matched to&nbsp;<span style={{ color: "#5EEBC0" }}>your industry.</span>
          </div>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.7)" }}>UAE-stock laptops, desktops, workstations and servers, with B2B pricing.</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {["Business-grade only", "UAE warranty", "VAT invoices"].map((t) => (
            <div key={t} style={{ display: "flex", border: "2px solid rgba(255,255,255,0.25)", borderRadius: 999, padding: "10px 22px", fontSize: 24 }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
