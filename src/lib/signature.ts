/** Email signature builder. Pure functions, so the same code draws the live preview and the signature in sent mail. */

export type Layout = "left" | "right" | "top" | "below";
export type Template = "corporate" | "classic";
export type LineStyle = "solid" | "dashed" | "dotted" | "double";
export type FontKey = "arial" | "verdana" | "tahoma" | "trebuchet" | "segoe" | "calibri" | "georgia";

/** Extra look-and-content settings, stored together as JSON on the brand row. */
export interface BrandStyle {
  template: Template;
  /** Corporate template: the line of services under the tagline. */
  services: string;
  /** Corporate template: e.g. "Authorized Business Partners: Dell • HP • Lenovo". Text before ":" is bold. */
  partners: string;
  /** Underlined heading above the address (corporate). Empty = no heading. */
  contactHeading: string;
  /** Company emails, separated by | or commas (corporate contact block). */
  emails: string;
  slogan: string;
  /** Small coloured line at the very bottom, e.g. "Think Green". */
  greenNote: string;
  /** Divider line thickness in px. 0 = no line. */
  lineWeight: number;
  lineStyle: LineStyle;
  /** "" = same as the accent colour. */
  lineColor: string;
  /** A second line above the confidentiality notice (corporate). */
  footerLine: boolean;
  textColor: string;
  mutedColor: string;
  noteColor: string;
  font: FontKey;
  fontSize: number;
  logoWidth: number;
  /** Corporate: show the sender's name, title and numbers above the company block. */
  showPerson: boolean;
}

export interface Brand extends BrandStyle {
  company: string;
  tagline: string;
  address: string;
  website: string;
  /** Company phone(s); several can be separated by | or commas. */
  mainPhone: string;
  layout: Layout;
  color: string;
  disclaimer: string;
  hasLogo: boolean;
}

export interface Person {
  name: string;
  jobTitle: string;
  phone: string;
  mobile: string;
  email: string;
}

export const DEFAULT_STYLE: BrandStyle = {
  template: "corporate",
  services: "",
  partners: "",
  contactHeading: "Contact Us",
  emails: "",
  slogan: "",
  greenNote: "",
  lineWeight: 2,
  lineStyle: "solid",
  lineColor: "",
  footerLine: false,
  textColor: "#333333",
  mutedColor: "#666666",
  noteColor: "#2e7d32",
  font: "arial",
  fontSize: 13,
  logoWidth: 120,
  showPerson: true,
};

export const STYLE_KEYS = Object.keys(DEFAULT_STYLE) as (keyof BrandStyle)[];

export const DEFAULT_BRAND: Brand = {
  company: "Zeronix",
  tagline: "",
  address: "",
  website: "",
  mainPhone: "",
  layout: "left",
  color: "#2a78d6",
  disclaimer: "",
  hasLogo: false,
  ...DEFAULT_STYLE,
};

/** The Zeronix company signature, so an admin can load it with one click and adjust. */
export const ZERONIX_SAMPLE: Partial<Brand> = {
  template: "corporate",
  company: "ZERONIX TECHNOLOGY LLC",
  tagline: "Your Trusted Partner in IT Products & Technology Solutions",
  services:
    "IT Hardware | Networking | Servers & Storage | Cybersecurity | ELV & Security Systems | AV Solutions | Software Development | IT Infrastructure",
  partners: "Authorized Business Partners: Dell • HP • Lenovo & Other Leading Technology Brands",
  contactHeading: "Contact Us",
  address: "Office 19, Khurram Building, Al Fahidi, Bur Dubai, UAE",
  mainPhone: "+971 50 981 1669 | +971 55 824 6066",
  emails: "sales@zeronix.ae | info@zeronix.ae",
  website: "www.zeronix.ae",
  slogan: "Empowering Businesses Through Smarter Technology.",
  disclaimer:
    "Confidentiality Notice: This email and any attachments are intended solely for the designated recipient(s) and may contain confidential information. If you have received this email in error, please notify the sender and delete it. Unauthorized use, disclosure, or distribution is prohibited.",
  greenNote: "🌱 Think Green — Please consider the environment before printing this email.",
};

export const LAYOUT_LABELS: Record<Layout, string> = {
  left: "Logo on the left",
  right: "Logo on the right",
  top: "Logo on top",
  below: "Logo at the bottom",
};

export const TEMPLATE_LABELS: Record<Template, string> = {
  corporate: "Corporate (company block, Contact Us, footer)",
  classic: "Classic (logo beside your details)",
};

export const LINE_STYLE_LABELS: Record<LineStyle, string> = {
  solid: "Solid",
  dashed: "Dashed",
  dotted: "Dotted",
  double: "Double (3 px or more)",
};

export const FONTS: Record<FontKey, { label: string; css: string }> = {
  arial: { label: "Arial", css: "Arial,Helvetica,sans-serif" },
  verdana: { label: "Verdana", css: "Verdana,Geneva,sans-serif" },
  tahoma: { label: "Tahoma", css: "Tahoma,Geneva,sans-serif" },
  trebuchet: { label: "Trebuchet MS", css: "'Trebuchet MS',Helvetica,sans-serif" },
  segoe: { label: "Segoe UI", css: "'Segoe UI',Arial,sans-serif" },
  calibri: { label: "Calibri", css: "Calibri,Arial,sans-serif" },
  georgia: { label: "Georgia (serif)", css: "Georgia,'Times New Roman',serif" },
};

export const LIMITS = { lineWeight: [0, 8], fontSize: [11, 16], logoWidth: [60, 240] } as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only #rgb or #rrggbb: the colour goes into inline styles, so nothing else is allowed through. */
export function safeColor(c: string, fallback = DEFAULT_BRAND.color) {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c.trim()) ? c.trim() : fallback;
}

/** Adds https:// when missing and only allows http(s) links. Returns "" for anything else. */
export function safeUrl(u: string): string {
  const t = u.trim();
  if (!t) return "";
  const full = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  return /^https?:\/\//i.test(full) ? full : "";
}

const clamp = (v: unknown, [min, max]: readonly [number, number], d: number) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? d : Math.min(max, Math.max(min, Math.round(n)));
};
const str = (v: unknown, d: string, max = 600) => (typeof v === "string" ? v.slice(0, max) : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T) => (opts.includes(v as T) ? (v as T) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" ? safeColor(v, d) : d);

/** Cleans style settings from anywhere (saved JSON, form state): unknown or bad values fall back to defaults. */
export function normalizeStyle(raw: unknown): BrandStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_STYLE;
  return {
    template: oneOf(r.template, ["corporate", "classic"], d.template),
    services: str(r.services, d.services, 300),
    partners: str(r.partners, d.partners, 300),
    contactHeading: str(r.contactHeading, d.contactHeading, 60),
    emails: str(r.emails, d.emails, 200),
    slogan: str(r.slogan, d.slogan, 160),
    greenNote: str(r.greenNote, d.greenNote, 200),
    lineWeight: clamp(r.lineWeight, LIMITS.lineWeight, d.lineWeight),
    lineStyle: oneOf(r.lineStyle, ["solid", "dashed", "dotted", "double"], d.lineStyle),
    lineColor: r.lineColor === "" ? "" : hex(r.lineColor, d.lineColor),
    footerLine: typeof r.footerLine === "boolean" ? r.footerLine : d.footerLine,
    textColor: hex(r.textColor, d.textColor),
    mutedColor: hex(r.mutedColor, d.mutedColor),
    noteColor: hex(r.noteColor, d.noteColor),
    font: oneOf(r.font, Object.keys(FONTS) as FontKey[], d.font),
    fontSize: clamp(r.fontSize, LIMITS.fontSize, d.fontSize),
    logoWidth: clamp(r.logoWidth, LIMITS.logoWidth, d.logoWidth),
    showPerson: typeof r.showPerson === "boolean" ? r.showPerson : d.showPerson,
  };
}

const telHref = (p: string) => "tel:" + p.replace(/[^\d+]/g, "");
/** "a | b, c" -> ["a", "b", "c"] */
const splitList = (s: string) =>
  s
    .split(/\s*[|,;\n]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
const multiline = (s: string) => esc(s).replace(/\n/g, "<br>");
/** Bolds a short lead-in before the first colon: "Confidentiality Notice: ..." */
const boldLead = (s: string) => {
  const i = s.indexOf(":");
  return i > 0 && i <= 40 ? `<b>${esc(s.slice(0, i + 1))}</b>${multiline(s.slice(i + 1))}` : multiline(s);
};

/** @param logoSrc  what the <img> points at: an app URL for previews, "cid:..." in real email. Empty = text mark. */
export function signatureHtml(brand: Brand, person: Person, logoSrc: string): string {
  const s = normalizeStyle(brand);
  const color = safeColor(brand.color);
  const text = s.textColor;
  const muted = s.mutedColor;
  const fs = s.fontSize;
  const small = Math.max(fs - 2, 10);
  const font = `font-family:${FONTS[s.font].css};font-size:${fs}px;line-height:1.45;color:${text};`;
  const rule = s.lineWeight > 0 ? `${s.lineWeight}px ${s.lineStyle} ${s.lineColor || color}` : "";
  const border = (side: string) => (rule ? `border-${side}:${rule};` : "");
  const link = (href: string, label: string, c = text) => `<a href="${esc(href)}" style="color:${c};text-decoration:none">${esc(label)}</a>`;
  const url = safeUrl(brand.website);
  const siteLabel = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const table = (rows: string, extra = "") =>
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="${font}border-collapse:collapse;${extra}">${rows}</table>`;

  const hasImg = brand.hasLogo && !!logoSrc;
  const img = hasImg
    ? `<img src="${esc(logoSrc)}" alt="${esc(brand.company)}" width="${s.logoWidth}" style="display:block;border:0;max-width:${s.logoWidth}px;height:auto">`
    : "";

  const personPhones = [
    person.phone && `T ${link(telHref(person.phone), person.phone)}`,
    person.mobile && `M ${link(telHref(person.mobile), person.mobile)}`,
  ].filter(Boolean);
  const personLines = [
    `<div style="font-size:${fs + 2}px;font-weight:700;color:#111111">${esc(person.name)}</div>`,
    person.jobTitle && `<div style="color:${color};font-weight:600">${esc(person.jobTitle)}</div>`,
  ];

  const companyPhones = splitList(brand.mainPhone);
  const footer = [
    s.slogan && `<div style="margin-top:10px;font-weight:700;font-style:italic;color:${color}">${esc(s.slogan)}</div>`,
    brand.disclaimer &&
      `<div style="font-size:${small}px;line-height:1.4;color:${muted};margin-top:12px;max-width:560px">${boldLead(brand.disclaimer)}</div>`,
    s.greenNote && `<div style="font-size:${small}px;color:${s.noteColor};margin-top:8px">${esc(s.greenNote)}</div>`,
  ];

  let body: string;
  if (s.template === "classic") {
    const logo = img || `<div style="font-size:20px;font-weight:700;letter-spacing:1px;color:${color}">${esc(brand.company.toUpperCase())}</div>`;
    const phones = personPhones.length
      ? personPhones
      : companyPhones.slice(0, 1).map((p) => `T ${link(telHref(p), p)}`);
    const lines = [
      ...personLines,
      `<div style="height:6px;line-height:6px">&nbsp;</div>`,
      phones.length && `<div>${phones.join(" &nbsp;|&nbsp; ")}</div>`,
      person.email && `<div>${link(`mailto:${person.email}`, person.email)}</div>`,
      url && `<div>${link(url, siteLabel, color)}</div>`,
      brand.address && `<div style="color:${muted}">${multiline(brand.address)}</div>`,
      brand.tagline && `<div style="color:${muted};font-style:italic">${esc(brand.tagline)}</div>`,
    ]
      .filter(Boolean)
      .join("");
    const pad = rule ? 16 : 12;
    if (brand.layout === "top") {
      body = table(`<tr><td style="padding-bottom:10px;${border("bottom")}">${logo}</td></tr><tr><td style="padding-top:10px">${lines}</td></tr>`);
    } else if (brand.layout === "below") {
      body = table(`<tr><td style="padding-bottom:10px;${border("bottom")}">${lines}</td></tr><tr><td style="padding-top:10px">${logo}</td></tr>`);
    } else if (brand.layout === "right") {
      body = table(
        `<tr><td valign="top" style="padding-right:${pad}px;${border("right")}">${lines}</td><td valign="middle" style="padding-left:${pad}px">${logo}</td></tr>`,
      );
    } else {
      body = table(
        `<tr><td valign="middle" style="padding-right:${pad}px;${border("right")}">${logo}</td><td valign="top" style="padding-left:${pad}px">${lines}</td></tr>`,
      );
    }
  } else {
    const label = (l: string) => `<span style="font-weight:700;color:${color}">${l}</span> `;
    const sep = ` <span style="color:${muted}">|</span> `;
    const personBlock = s.showPerson
      ? [
          ...personLines,
          personPhones.length && `<div>${personPhones.join(" &nbsp;|&nbsp; ")}</div>`,
          person.email && `<div>${link(`mailto:${person.email}`, person.email)}</div>`,
          `<div style="height:12px;line-height:12px;font-size:1px">&nbsp;</div>`,
        ]
          .filter(Boolean)
          .join("")
      : "";

    const head = [
      brand.company && `<div style="font-size:${fs + 5}px;font-weight:700;letter-spacing:.5px;color:${color}">${esc(brand.company)}</div>`,
      brand.tagline && `<div style="font-weight:600;color:${text}">${esc(brand.tagline)}</div>`,
      s.services && `<div style="font-size:${fs - 1}px;color:${muted};margin-top:4px">${esc(s.services)}</div>`,
      s.partners && `<div style="font-size:${fs - 1}px;color:${text};margin-top:2px">${boldLead(s.partners)}</div>`,
    ]
      .filter(Boolean)
      .join("");
    let header = head;
    if (img) {
      if (brand.layout === "top") header = table(`<tr><td style="padding-bottom:8px">${img}</td></tr><tr><td>${head}</td></tr>`);
      else if (brand.layout === "below") header = table(`<tr><td style="padding-bottom:8px">${head}</td></tr><tr><td>${img}</td></tr>`);
      else if (brand.layout === "right")
        header = table(`<tr><td valign="middle" style="padding-right:14px">${head}</td><td valign="middle">${img}</td></tr>`);
      else header = table(`<tr><td valign="middle" style="padding-right:14px">${img}</td><td valign="middle">${head}</td></tr>`);
    }

    const divider = rule
      ? table(`<tr><td style="border-top:${rule};font-size:1px;line-height:1px;height:1px">&nbsp;</td></tr>`, "width:100%;margin:10px 0")
      : `<div style="height:10px;line-height:10px;font-size:1px">&nbsp;</div>`;

    const emails = splitList(s.emails);
    const contact = [
      s.contactHeading && `<div style="font-weight:700;text-decoration:underline;color:${text};margin-bottom:2px">${esc(s.contactHeading)}</div>`,
      brand.address && `<div>${multiline(brand.address)}</div>`,
      companyPhones.length && `<div>${label("T:")}${companyPhones.map((p) => link(telHref(p), p)).join(sep)}</div>`,
      emails.length && `<div>${label("E:")}${emails.map((e) => link(`mailto:${e}`, e)).join(sep)}</div>`,
      url && `<div>${label("W:")}${link(url, siteLabel)}</div>`,
    ]
      .filter(Boolean)
      .join("");

    const tail = [
      footer[0],
      s.footerLine && rule && (footer[1] || footer[2]) ? divider : "",
      footer[1],
      footer[2],
    ];
    body = [personBlock, header, divider, contact, ...tail].filter(Boolean).join("");
    return `<div style="margin-top:16px;max-width:600px;${font}">${body}</div>`;
  }

  return `<div style="margin-top:16px;${font}">${body}${footer.filter(Boolean).join("")}</div>`;
}

export function signatureText(brand: Brand, person: Person): string {
  const s = normalizeStyle(brand);
  const url = safeUrl(brand.website).replace(/^https?:\/\//i, "");
  const personPhones = [person.phone && `T ${person.phone}`, person.mobile && `M ${person.mobile}`].filter(Boolean).join("  |  ");
  const companyPhones = splitList(brand.mainPhone);
  const join = (xs: (string | number | false | undefined)[]) => xs.filter(Boolean).join("\n");

  if (s.template === "classic") {
    return join([
      "--",
      person.name,
      person.jobTitle,
      brand.company,
      personPhones || (companyPhones[0] && `T ${companyPhones[0]}`),
      person.email,
      url,
      brand.address,
      s.slogan && `\n${s.slogan}`,
      brand.disclaimer && `\n${brand.disclaimer}`,
      s.greenNote && `\n${s.greenNote}`,
    ]);
  }

  const emails = splitList(s.emails);
  return join([
    "--",
    s.showPerson && join([person.name, person.jobTitle, personPhones, person.email]) + "\n",
    brand.company,
    brand.tagline,
    s.services,
    s.partners,
    s.lineWeight > 0 ? "────────────────────────────" : "",
    s.contactHeading,
    brand.address,
    companyPhones.length && `T: ${companyPhones.join(" | ")}`,
    emails.length && `E: ${emails.join(" | ")}`,
    url && `W: ${url}`,
    s.slogan && `\n${s.slogan}`,
    brand.disclaimer && `\n${brand.disclaimer}`,
    s.greenNote && `\n${s.greenNote}`,
  ]);
}
