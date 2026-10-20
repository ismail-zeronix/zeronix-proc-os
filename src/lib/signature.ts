/** Email signature builder. Pure functions, so the same code draws the live preview and the signature in sent mail. */

export type Layout = "left" | "right" | "top" | "below";

export interface Brand {
  company: string;
  tagline: string;
  address: string;
  website: string;
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
};

export const LAYOUT_LABELS: Record<Layout, string> = {
  left: "Logo on the left",
  right: "Logo on the right",
  top: "Logo on top",
  below: "Logo at the bottom",
};

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

const telHref = (p: string) => "tel:" + p.replace(/[^\d+]/g, "");

/** @param logoSrc  what the <img> points at: an app URL for previews, "cid:..." in real email. Empty = text mark. */
export function signatureHtml(brand: Brand, person: Person, logoSrc: string): string {
  const color = safeColor(brand.color);
  const font = "font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#333333;";
  const url = safeUrl(brand.website);
  const site = url ? `<a href="${esc(url)}" style="color:${color};text-decoration:none">${esc(url.replace(/^https?:\/\//i, "").replace(/\/$/, ""))}</a>` : "";

  const logo =
    brand.hasLogo && logoSrc
      ? `<img src="${esc(logoSrc)}" alt="${esc(brand.company)}" width="120" style="display:block;border:0;max-width:120px;height:auto">`
      : `<div style="font-size:20px;font-weight:700;letter-spacing:1px;color:${color}">${esc(brand.company.toUpperCase())}</div>`;

  const phones = [
    person.phone && `T <a href="${esc(telHref(person.phone))}" style="color:#333333;text-decoration:none">${esc(person.phone)}</a>`,
    person.mobile && `M <a href="${esc(telHref(person.mobile))}" style="color:#333333;text-decoration:none">${esc(person.mobile)}</a>`,
  ].filter(Boolean);
  if (!person.phone && !person.mobile && brand.mainPhone) {
    phones.push(`T <a href="${esc(telHref(brand.mainPhone))}" style="color:#333333;text-decoration:none">${esc(brand.mainPhone)}</a>`);
  }

  const lines = [
    `<div style="font-size:15px;font-weight:700;color:#111111">${esc(person.name)}</div>`,
    person.jobTitle && `<div style="color:${color};font-weight:600">${esc(person.jobTitle)}</div>`,
    `<div style="height:6px;line-height:6px">&nbsp;</div>`,
    phones.length && `<div>${phones.join(" &nbsp;|&nbsp; ")}</div>`,
    person.email && `<div><a href="mailto:${esc(person.email)}" style="color:#333333;text-decoration:none">${esc(person.email)}</a></div>`,
    site && `<div>${site}</div>`,
    brand.address && `<div style="color:#666666">${esc(brand.address).replace(/\n/g, "<br>")}</div>`,
    brand.tagline && `<div style="color:#666666;font-style:italic">${esc(brand.tagline)}</div>`,
  ]
    .filter(Boolean)
    .join("");

  const table = (rows: string) => `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="${font}border-collapse:collapse">${rows}</table>`;
  let body: string;
  if (brand.layout === "top") {
    body = table(
      `<tr><td style="padding-bottom:10px;border-bottom:3px solid ${color}">${logo}</td></tr><tr><td style="padding-top:10px">${lines}</td></tr>`,
    );
  } else if (brand.layout === "below") {
    body = table(
      `<tr><td style="padding-bottom:10px;border-bottom:3px solid ${color}">${lines}</td></tr><tr><td style="padding-top:10px">${logo}</td></tr>`,
    );
  } else if (brand.layout === "right") {
    body = table(
      `<tr><td valign="top" style="padding-right:16px;border-right:3px solid ${color}">${lines}</td><td valign="middle" style="padding-left:16px">${logo}</td></tr>`,
    );
  } else {
    body = table(
      `<tr><td valign="middle" style="padding-right:16px;border-right:3px solid ${color}">${logo}</td><td valign="top" style="padding-left:16px">${lines}</td></tr>`,
    );
  }

  const disclaimer = brand.disclaimer
    ? `<div style="${font}font-size:11px;color:#888888;margin-top:12px;max-width:520px">${esc(brand.disclaimer).replace(/\n/g, "<br>")}</div>`
    : "";
  return `<div style="margin-top:16px">${body}${disclaimer}</div>`;
}

export function signatureText(brand: Brand, person: Person): string {
  const url = safeUrl(brand.website);
  return [
    "--",
    person.name,
    person.jobTitle,
    brand.company,
    [person.phone && `T ${person.phone}`, person.mobile && `M ${person.mobile}`].filter(Boolean).join("  |  ") ||
      (brand.mainPhone && `T ${brand.mainPhone}`),
    person.email,
    url && url.replace(/^https?:\/\//i, ""),
    brand.address,
    brand.disclaimer && `\n${brand.disclaimer}`,
  ]
    .filter(Boolean)
    .join("\n");
}
