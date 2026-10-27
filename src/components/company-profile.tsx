import { docFont } from "@/components/doc-font";
import { type QuoteBrand, safeColor, tint } from "@/components/quote-document";
import { displayCompany } from "@/lib/proposal";

/*
 * The words on this page come from Zeronix's own sites, not from the portal's data: zeronix.ae (services, figures,
 * email) and eazytime.app (EazyTime features and contact). Keep them in step with those sites; do not add claims here
 * that the sites do not make.
 */

const TAGLINE = "Your Trusted Partner in IT Products & Technology Solutions";
const EMAIL = "info@zeronix.ae";

const FIGURES: [string, string][] = [
  ["100+", "Projects delivered"],
  ["5+", "Years of experience"],
  ["50+", "Team members"],
  ["24/7", "Support"],
];

const SERVICES: { title: string; text: string; items: string }[] = [
  { title: "IT Services", text: "Day-to-day IT run for you, from a new office to a move.", items: "IT AMC · New office IT setup · IT relocation · IT consultancy · ICT solutions" },
  { title: "Custom Software Development", text: "Software built around your workflows, users and goals.", items: "Web & mobile apps · E-commerce · Custom software · AI & machine learning" },
  { title: "Business Solutions", text: "Ready-made systems that are quick to roll out.", items: "Inventory management · POS · Gym management · Attendance management" },
  { title: "Cloud Services", text: "Microsoft cloud set up, secured and managed.", items: "Microsoft 365 · Microsoft 365 Copilot · Windows 365 Cloud PC · Backup as a Service" },
  { title: "System Integration", text: "Networks, servers and site systems that work as one.", items: "Structured cabling · Switching & routing · Servers & storage · CCTV · Access control · IP telephony · AV" },
  { title: "IT Support & Security", text: "Remote and on-site help, with your systems protected.", items: "Remote IT support · Next-gen firewall · Endpoint & email security · Security audits" },
];

const EAZYTIME = {
  tagline: "Intelligent Time & Attendance for Contract & Multi-Site Workforce",
  intro: "Accurate time logs using biometric and location verification, with AI that flags attendance anomalies. Run it as the full workforce platform, or as EazyTime Sync to push attendance into the HRMS you already use.",
  features: [
    ["Time capture", "Biometric terminals, mobile app with GPS and face check-in, QR, NFC, web portal and offline punching."],
    ["Shift scheduling", "Fixed, rotating and roster schedules, drag-and-drop rosters, shift swaps and auto-absent detection."],
    ["Overtime & breaks", "Automatic overtime multipliers, paid and unpaid breaks and approvals, with UAE labour law defaults."],
    ["Leave management", "Balances, requests and multi-level approvals with escalation and delegation."],
    ["Reports & integrations", "Attendance, overtime, leave and project-hours reports; SAP, Zoho, Odoo, Oracle and REST API."],
    ["Document tracking", "Alerts 30, 60 and 90 days before Emirates ID, visa, labour card and passport expiry."],
  ] as [string, string][],
  benefits: [
    "Face recognition stops buddy punching",
    "GPS geofencing keeps clock-ins on site",
    "One dashboard for every site",
    "Offline punches sync when back online",
    "Payroll-ready exports after approval",
    "Cloud (UAE region) or on-premise",
  ],
  contact: [
    ["Phone & WhatsApp", "+971 56 614 2543"],
    ["Email", "info@eazytime.app"],
    ["Web", "eazytime.app"],
    ["Hours", "Mon–Sat, 10:00 AM – 8:00 PM"],
  ] as [string, string][],
};

/** A green circuit-board pattern for the top-right corner that fades to white towards the page. No images: plain SVG. */
function CircuitCorner({ color }: { color: string }) {
  const W = 420;
  const lines: string[] = [];
  const nodes: [number, number][] = [];
  // traces dropping from the top edge, then turning 45° towards the page
  for (let k = 0; k < 12; k++) {
    const x = W - 14 - k * 30;
    const a = 26 + ((k * 37) % 96);
    const d = 18 + ((k * 53) % 64);
    const b = 10 + ((k * 29) % 48);
    lines.push(`M${x} 0V${a}l${-d} ${d}v${b}`);
    nodes.push([x - d, a + d + b]);
  }
  // traces coming in from the right edge
  for (let k = 0; k < 10; k++) {
    const y = 18 + k * 30;
    const a = 30 + ((k * 41) % 110);
    const d = 16 + ((k * 31) % 56);
    const b = 12 + ((k * 23) % 44);
    lines.push(`M${W} ${y}H${W - a}l${-d} ${d}h${-b}`);
    nodes.push([W - a - d - b, y + d]);
  }
  const dots: [number, number][] = [];
  for (let x = 8; x < W; x += 16) for (let y = 8; y < W; y += 16) if (x + (W - y) > W * 0.9) dots.push([x, y]);
  return (
    <svg className="pointer-events-none absolute top-0 right-0" width="118mm" height="118mm" viewBox={`0 0 ${W} ${W}`} aria-hidden>
      <defs>
        <radialGradient id="zx-fade" cx="1" cy="0" r="1.05">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="zx-mask">
          <rect width={W} height={W} fill="url(#zx-fade)" />
        </mask>
      </defs>
      <g mask="url(#zx-mask)">
        <rect width={W} height={W} fill={tint(color, 7)} />
        {dots.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={1} fill={color} opacity={0.22} />
        ))}
        <g fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.6}>
          {lines.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <rect x={W - 150} y={58} width={46} height={46} rx={5} fill="#fff" stroke={color} strokeWidth={1.4} opacity={0.7} />
        <rect x={W - 92} y={150} width={34} height={34} rx={4} fill="#fff" stroke={color} strokeWidth={1.4} opacity={0.6} />
        {nodes.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={3.4} fill="#fff" stroke={color} strokeWidth={1.4} opacity={0.75} />
        ))}
      </g>
    </svg>
  );
}

function Heading({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-[3px] w-6 rounded-full" style={{ background: color }} />
      <h2 className="text-[10px] font-bold tracking-[0.16em] uppercase" style={{ color }}>
        {children}
      </h2>
    </div>
  );
}

/**
 * The second page of customer documents: who Zeronix is, what it does, and EazyTime. One full A4 sheet edge to edge
 * (the print page gives it a margin-free page of its own), drawn in the same type and colours as the document before it.
 */
export function CompanyProfile({ brand }: { brand: QuoteBrand }) {
  const accent = safeColor(brand.color);
  const company = displayCompany(brand.company);
  return (
    <section
      className={`${docFont.className} zx-profile relative flex h-[1122px] flex-col overflow-hidden bg-white px-[15mm] pt-[13mm] pb-[10mm] text-[11px] leading-normal text-neutral-700 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:h-[295mm]`}
      aria-label={`About ${company}`}
    >
      <CircuitCorner color={accent} />

      <header className="relative">
        {brand.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoSrc} alt={company} className="max-h-12 max-w-48 object-contain" />
        ) : (
          <div className="text-lg font-extrabold text-neutral-900">{company}</div>
        )}
        <div className="mt-6 text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: accent }}>
          Company profile
        </div>
        <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight text-neutral-900">{company}</h1>
        <p className="mt-0.5 text-[13px] font-medium text-neutral-500">{TAGLINE}</p>
        <p className="mt-3 max-w-[128mm] text-[11.5px] leading-relaxed">
          {company} is an IT solutions provider in Bur Dubai, serving businesses across the UAE. We plan, deliver and support the technology a business runs on, from
          networks, servers and cybersecurity to Microsoft cloud and custom software, backed by round-the-clock support.
        </p>
      </header>

      <div className="relative mt-5 grid grid-cols-4 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {FIGURES.map(([n, label], i) => (
          <div key={label} className={`px-4 py-2.5 ${i ? "border-l border-neutral-200" : ""}`}>
            <div className="text-[20px] leading-none font-extrabold" style={{ color: accent }}>
              {n}
            </div>
            <div className="mt-1 text-[9.5px] font-semibold tracking-wide text-neutral-500 uppercase">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Heading color={accent}>What we do</Heading>
        <div className="mt-3 grid grid-cols-3 gap-x-5 gap-y-4">
          {SERVICES.map((s, i) => (
            <div key={s.title} className="border-t pt-2.5" style={{ borderColor: tint(accent, 30) }}>
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-bold tabular-nums" style={{ color: accent }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[12px] font-bold text-neutral-900">{s.title}</h3>
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-neutral-600">{s.text}</p>
              <p className="mt-1 text-[9.5px] leading-snug text-neutral-500">{s.items}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border" style={{ borderColor: tint(accent, 30) }}>
        <div className="flex items-end justify-between gap-4 px-5 pt-4 pb-3" style={{ background: tint(accent, 7) }}>
          <div>
            <div className="text-[10px] font-bold tracking-[0.16em] uppercase" style={{ color: accent }}>
              Our product
            </div>
            <div className="mt-0.5 text-[22px] leading-none font-extrabold tracking-tight text-neutral-900">
              Eazy<span style={{ color: accent }}>Time</span>
            </div>
            <div className="mt-1 text-[11.5px] font-semibold text-neutral-700">{EAZYTIME.tagline}</div>
          </div>
          <div className="shrink-0 text-right text-[9.5px] text-neutral-500">by {company}</div>
        </div>
        <div className="grid grid-cols-[1fr_52mm] gap-5 px-5 pt-3 pb-4">
          <div>
            <p className="text-[10.5px] leading-relaxed">{EAZYTIME.intro}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
              {EAZYTIME.features.map(([t, d]) => (
                <div key={t}>
                  <div className="text-[10.5px] font-bold text-neutral-900">{t}</div>
                  <div className="text-[9.5px] leading-snug text-neutral-600">{d}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[9.5px] font-bold tracking-[0.12em] text-neutral-500 uppercase">Key benefits</div>
              <ul className="mt-1.5 grid gap-1">
                {EAZYTIME.benefits.map((b) => (
                  <li key={b} className="flex gap-1.5 text-[10px] leading-snug">
                    <span className="mt-[5px] size-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg px-3 py-2.5 text-white" style={{ background: accent }}>
              <div className="text-[9.5px] font-bold tracking-[0.12em] uppercase opacity-80">Free demo &amp; trial</div>
              <dl className="mt-1 grid gap-0.5 text-[10px]">
                {EAZYTIME.contact.map(([k, v]) => (
                  <div key={k}>
                    <dt className="sr-only">{k}</dt>
                    <dd className={k === "Hours" ? "opacity-80" : "font-semibold"}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-auto flex items-center justify-between gap-4 border-t pt-3 text-[9.5px] text-neutral-500" style={{ borderColor: tint(accent, 30) }}>
        <span className="font-semibold text-neutral-800">{company}</span>
        <span className="text-right">{[brand.address, brand.mainPhone, EMAIL, brand.website].filter(Boolean).join("  ·  ")}</span>
      </footer>
    </section>
  );
}
