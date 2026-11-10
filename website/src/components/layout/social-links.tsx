import { SOCIAL_PATHS } from "./social-paths";

type Network = keyof typeof SOCIAL_PATHS;

const NETWORKS: { key: Network; name: string; host: RegExp }[] = [
  { key: "linkedin", name: "LinkedIn", host: /(^|\.)linkedin\.com$/ },
  { key: "instagram", name: "Instagram", host: /(^|\.)instagram\.com$/ },
  { key: "facebook", name: "Facebook", host: /(^|\.)(facebook|fb)\.com$/ },
  { key: "youtube", name: "YouTube", host: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { key: "x", name: "X (Twitter)", host: /(^|\.)(x|twitter)\.com$/ },
  { key: "trustpilot", name: "Trustpilot", host: /(^|\.)trustpilot\.com$/ },
];

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/** The company profiles (Website › Settings › Brand) we have an icon for, in a fixed order. */
export function socialLinks(profiles: string[]) {
  return NETWORKS.flatMap((n) => {
    const href = profiles.find((u) => n.host.test(hostOf(u)));
    return href ? [{ ...n, href }] : [];
  });
}

export function SocialIcon({ network, className }: { network: Network; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d={SOCIAL_PATHS[network]} />
    </svg>
  );
}

/** Round icon buttons for the footer, plus a Trustpilot "read our reviews" pill when there is a Trustpilot page. */
export function SocialLinks({ profiles, brandName }: { profiles: string[]; brandName: string }) {
  const links = socialLinks(profiles);
  if (!links.length) return null;
  const social = links.filter((l) => l.key !== "trustpilot");
  const trust = links.find((l) => l.key === "trustpilot");
  return (
    <div className="flex flex-wrap items-center gap-3">
      {social.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`${brandName} on social media`}>
          {social.map((l) => (
            <li key={l.key}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener me"
                aria-label={`${brandName} on ${l.name}`}
                title={l.name}
                className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-white/80 transition-colors hover:border-cta hover:bg-cta hover:text-brand-950"
              >
                <SocialIcon network={l.key} className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {trust && (
        <a
          href={trust.href}
          target="_blank"
          rel="noopener me"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-sm text-white/85 transition-colors hover:border-[#00b67a] hover:text-white"
        >
          <SocialIcon network="trustpilot" className="size-4 text-[#00b67a]" />
          Read our reviews on <span className="font-semibold">Trustpilot</span>
        </a>
      )}
    </div>
  );
}
