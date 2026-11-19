/** Reads pasted or uploaded text into contacts. Pure, so it is tested without a database. */

export interface ParsedContact {
  email: string;
  name: string;
  company: string;
}

export interface ParsedList {
  contacts: ParsedContact[];
  /** Lines that did not hold an email address (header row excluded). */
  invalid: string[];
  /** Addresses repeated in the text (only the first is kept). */
  duplicates: number;
}

const EMAIL = /[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const SPLIT = /[,;\t]/;
const clean = (s: string) => s.replace(/^["'\s<>]+|["'\s<>]+$/g, "").replace(/\s+/g, " ").trim();

/**
 * Accepts one address per line in any of these shapes: `a@b.ae`, `Sara Khan <a@b.ae>`, `a@b.ae, Sara Khan, Acme LLC`
 * (email, name, company), or a CSV/TSV whose first row names the columns (email, name, company).
 */
export function parseContacts(text: string): ParsedList {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedList = { contacts: [], invalid: [], duplicates: 0 };
  const seen = new Set<string>();

  let cols: { email: number; name: number; company: number } | null = null;
  if (lines.length && !EMAIL.test(lines[0]) && /e-?mail/i.test(lines[0])) {
    const head = lines.shift()!.split(SPLIT).map((h) => clean(h).toLowerCase());
    const find = (re: RegExp) => head.findIndex((h) => re.test(h));
    cols = { email: find(/e-?mail/), name: find(/^(full )?name|contact/), company: find(/company|organi[sz]ation|business/) };
  }

  for (const line of lines) {
    let email = "";
    let name = "";
    let company = "";
    if (cols && cols.email >= 0) {
      const cells = line.split(SPLIT).map(clean);
      email = (EMAIL.exec(cells[cols.email] ?? "") ?? [""])[0];
      name = cols.name >= 0 ? (cells[cols.name] ?? "") : "";
      company = cols.company >= 0 ? (cells[cols.company] ?? "") : "";
    } else {
      const m = EMAIL.exec(line);
      if (m) {
        email = m[0];
        const rest = (line.slice(0, m.index) + "," + line.slice(m.index + m[0].length)).split(SPLIT).map(clean).filter(Boolean);
        name = rest[0] ?? "";
        company = rest[1] ?? "";
      }
    }
    email = email.toLowerCase();
    if (!email) {
      out.invalid.push(line.slice(0, 80));
      continue;
    }
    if (seen.has(email)) {
      out.duplicates++;
      continue;
    }
    seen.add(email);
    out.contacts.push({ email, name: name.slice(0, 120), company: company.slice(0, 160) });
  }
  return out;
}

/** The first word of a name, for "Hello {name}". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
