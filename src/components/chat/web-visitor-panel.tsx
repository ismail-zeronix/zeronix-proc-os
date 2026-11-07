"use client";

import { Building2, Copy, Download, Flame, Globe, Mail, MapPin, MessageCircle, Phone, UserCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { dubaiToday, TZ } from "@/lib/dates";
import { describeDevice } from "@/lib/webchat/device";
import { looksLikeEmail } from "@/lib/webchat/qualify";
import { pathOf, type WebNetworkKind, type WebPageVisit, type WebSiteEvent } from "@/lib/webchat/types";
import { timeOf } from "./message-row";
import { canSaveLead, HeatPill, SaveLeadButton, Stars } from "./web-chat";
import { useWebChats, useWebThread } from "./web-data";

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dubaiToday(d) === dubaiToday() ? "Today" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })} ${timeOf(iso)}`;
}

/** "1 m 20 s", "45 s". */
function duration(seconds: number | undefined): string {
  if (!seconds) return "";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} m ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} m`;
}

function host(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Their clock right now ("14:05, Thu"), from their time zone. */
function localTime(tz: string | undefined): string {
  if (!tz) return "";
  try {
    return new Date().toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short" });
  } catch {
    return "";
  }
}

/** A titled block of label / value rows. Labels sit in a narrow column so values get the width (no sideways scroll). */
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 border-t px-3 pt-3 pb-1">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false);
  if (!shown.length) return <p className="text-xs text-muted-foreground">Not known yet.</p>;
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="pt-px text-xs text-muted-foreground">{label}</dt>
          <dd className="min-w-0 wrap-break-word">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PagesVisited({ pages }: { pages: WebPageVisit[] }) {
  const total = pages.reduce((n, p) => n + (p.seconds ?? 0), 0);
  return (
    <Section title={`Pages visited · ${pages.length}`}>
      {total > 0 && <p className="text-xs text-muted-foreground">{duration(total)} on the site in this visit</p>}
      <ol className="grid gap-1.5">
        {pages
          .map((p, i) => ({ p, i }))
          .reverse()
          .map(({ p, i }) => (
            <li key={`${p.at}-${i}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 text-xs">
              <span className="pt-px text-muted-foreground tabular-nums">{timeOf(p.at)}</span>
              <span className="min-w-0">
                <a href={p.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline" title={p.url}>
                  {p.title || pathOf(p.url)}
                </a>
                <span className="block truncate text-muted-foreground" title={p.url}>
                  {pathOf(p.url)}
                  {p.seconds ? ` · ${duration(p.seconds)}` : ""}
                  {p.scroll ? ` · read ${p.scroll}%` : ""}
                  {i === 0 ? " · landed here" : ""}
                </span>
              </span>
            </li>
          ))}
      </ol>
    </Section>
  );
}

const NETWORK_LABEL: Record<WebNetworkKind, string> = {
  business: "A company's own network",
  isp: "Home or mobile internet",
  hosting: "Data centre: a VPN, or a bot",
};

/**
 * A number WhatsApp can open: digits with the country code. A local UAE number (050 123 4567) gets 971 in front when
 * the visitor is in the UAE or nothing says otherwise.
 */
function whatsappNumber(phone: string, countryCode: string | undefined): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (/^05\d{8}$/.test(digits) && (!countryCode || countryCode === "AE")) return `971${digits.slice(1)}`;
  return digits;
}

const EVENT_VIEW: Record<WebSiteEvent["kind"], { icon: React.ReactNode; text: string }> = {
  call: { icon: <Phone className="size-3.5" />, text: "Clicked to call" },
  whatsapp: { icon: <MessageCircle className="size-3.5" />, text: "Clicked WhatsApp" },
  email: { icon: <Mail className="size-3.5" />, text: "Clicked to email" },
  download: { icon: <Download className="size-3.5" />, text: "Downloaded" },
  copy: { icon: <Copy className="size-3.5" />, text: "Copied" },
};

/** Phone, WhatsApp and email clicks, downloads and copies on the site: the strongest signs they want to talk. */
function SiteActions({ events }: { events: WebSiteEvent[] }) {
  return (
    <Section title={`On the site · ${events.length}`}>
      <ol className="grid gap-1.5">
        {[...events].reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 text-xs">
            <span className="pt-px text-muted-foreground tabular-nums">{timeOf(e.at)}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-medium">
                {EVENT_VIEW[e.kind].icon}
                {EVENT_VIEW[e.kind].text}
              </span>
              {e.label && (
                <span className="block truncate text-muted-foreground" title={e.label}>
                  {e.label}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/**
 * Everything known about a website visitor, beside their chat: what they filled in, where they are (from their IP, or
 * exactly if they allowed it), their device, how they found the site, every page they opened, and their earlier chats.
 */
export function WebVisitorPanel({ id }: { id: number }) {
  const web = useWebChats();
  const thread = useWebThread(id);
  const chat = web.data?.chats.find((c) => c.id === id);
  const info = thread.data?.info;
  if (!chat) return null;
  const client = info?.client ?? null;
  const ip = info?.geo?.ip;
  const precise = info?.geo?.precise;
  const device = info ? describeDevice(info.userAgent, client) : null;
  const question = thread.data?.messages.find((m) => m.sender === "visitor")?.body;
  const lat = precise?.lat ?? ip?.lat;
  const lon = precise?.lon ?? ip?.lon;
  const zoom = precise ? 0.004 : 0.08;
  const campaign = client?.campaign ?? {};
  // the sent form, or what they typed into it (or wrote in the chat box) before leaving
  const contact = chat.lead ?? chat.partial;
  const email = contact?.email && looksLikeEmail(contact.email) ? contact.email : "";
  const phone = contact?.phone;
  const wa = phone ? whatsappNumber(phone, ip?.countryCode) : "";
  const draft = info?.draft.trim();
  const network = info?.network;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-3 text-sm font-medium">Visitor details</header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4">
        <div className="grid gap-3 p-3">
          <div className="flex items-center gap-3">
            {contact?.name ? (
              <UserAvatar name={contact.name} size={44} />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Globe className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold">{contact?.name || contact?.email || `Visitor #${chat.id}`}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[contact?.company || (network === "business" ? ip?.org : ""), chat.place].filter(Boolean).join(" · ") || (contact ? "" : "Has not filled in the form yet")}
              </p>
              <p className="text-xs">
                <span className={`mr-1 inline-block size-2 rounded-full ${chat.online ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                {chat.online ? "On the website now" : "Left the website"}
                {(client?.visits ?? 1) > 1 && <span className="font-medium text-teal-700 dark:text-teal-400"> · returning, visit {client?.visits}</span>}
              </p>
            </div>
          </div>
          {(email || phone) && (
            <div className="grid grid-cols-3 gap-1.5">
              <Button size="sm" variant="outline" disabled={!email} nativeButton={false} render={<a href={email ? `mailto:${email}` : undefined} />}>
                <Mail /> Email
              </Button>
              <Button size="sm" variant="outline" disabled={!phone} nativeButton={false} render={<a href={phone ? `tel:${phone}` : undefined} />}>
                <Phone /> Call
              </Button>
              <Button size="sm" variant="outline" disabled={!wa} nativeButton={false} render={<a href={wa ? `https://wa.me/${wa}` : undefined} target="_blank" rel="noreferrer" />}>
                <MessageCircle /> WhatsApp
              </Button>
            </div>
          )}
          {canSaveLead(chat) && <SaveLeadButton chat={chat} />}
        </div>

        <Section title="Lead score" icon={<Flame className="size-3.5" />}>
          <div className="flex items-center gap-2">
            <HeatPill heat={chat.heat} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={chat.heat.score} aria-valuemin={0} aria-valuemax={100} aria-label="Lead score">
              <div
                className={`h-full rounded-full ${chat.heat.level === "hot" ? "bg-red-500" : chat.heat.level === "warm" ? "bg-amber-500" : "bg-sky-500"}`}
                style={{ width: `${Math.max(chat.heat.score, 3)}%` }}
              />
            </div>
          </div>
          {chat.heat.reasons.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {chat.heat.reasons.map((r) => (
                <li key={r} className={`rounded-md px-1.5 py-0.5 text-[11px] ${r.startsWith("Data-centre") ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-muted"}`}>
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing yet: rises as they read pages, come back, click to call or leave their details.</p>
          )}
        </Section>

        {info?.crm && (
          <Section title="In the CRM" icon={<Building2 className="size-3.5" />}>
            <Facts
              rows={[
                [
                  "Company",
                  <Link key="co" href={`/crm/companies/${info.crm.companyId}`} className="font-medium text-primary hover:underline">
                    {info.crm.companyName}
                  </Link>,
                ],
                ["Contact", info.crm.contactName],
                ["Matched by", info.crm.how === "email" ? "Their email address" : info.crm.how === "email domain" ? "Their email's company domain" : "The company network they browse from"],
                ["History", `${info.crm.deals} deal${info.crm.deals === 1 ? "" : "s"} · ${info.crm.orders} order${info.crm.orders === 1 ? "" : "s"}`],
              ]}
            />
            {info.crm.orders > 0 && <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">An existing customer.</p>}
          </Section>
        )}

        {info?.known && (
          <Section title="Known visitor" icon={<UserCheck className="size-3.5" />}>
            <p className="text-xs text-muted-foreground">
              This browser sent its details in an earlier chat,{" "}
              <Link href={`/chat/website?c=${info.known.chatId}`} className="text-primary hover:underline">
                {when(info.known.at)}
              </Link>
              .
            </p>
            <Facts
              rows={[
                ["Name", info.known.name],
                ["Email", info.known.email && <a href={`mailto:${info.known.email}`} className="text-primary hover:underline">{info.known.email}</a>],
                ["Phone", info.known.phone],
                ["Company", info.known.company],
              ]}
            />
          </Section>
        )}

        {(info?.site || info?.context) && (
          <Section title="Asked from">
            <Facts
              rows={[
                ["Website", info.site],
                ["Industry", info.context?.industry],
                ["Product", info.context?.product],
                ["Category", info.context?.category],
                ["Button", info.context?.cta],
                ["Page", info.context?.page],
                ["First visit", info.context?.landing],
                ["Came from", info.context?.referrer],
              ]}
            />
          </Section>
        )}

        <Section title={chat.lead || !contact ? "Contact" : "Contact · typed, not sent"}>
          <Facts
            rows={[
              ["Name", !chat.lead && contact?.name],
              [
                "Email",
                contact?.email &&
                  (email ? (
                    <a href={`mailto:${email}`} className="text-primary hover:underline">
                      {email}
                    </a>
                  ) : (
                    <span>
                      {contact.email} <span className="text-xs text-muted-foreground">(not finished)</span>
                    </span>
                  )),
              ],
              ["Phone", phone],
              ["Company", contact?.company],
              ["Question", question && <span className="whitespace-pre-wrap">{question}</span>],
              [
                "Not sent",
                draft && (
                  <span className="whitespace-pre-wrap text-muted-foreground italic">
                    “{draft}”{info?.draftAt && <span className="not-italic"> · {when(info.draftAt)}</span>}
                  </span>
                ),
              ],
            ]}
          />
          {!chat.lead && contact && <p className="text-[11px] text-muted-foreground">They typed this into the chat but left before sending the form.</p>}
        </Section>

        <Section title="Location" icon={<MapPin className="size-3.5" />}>
          {lat != null && lon != null && (
            <iframe
              title="Visitor location"
              loading="lazy"
              className="h-36 w-full rounded-lg border"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${lon - zoom},${lat - zoom},${lon + zoom},${lat + zoom}&layer=mapnik&marker=${lat},${lon}`}
            />
          )}
          <Facts
            rows={[
              ["Exact place", precise && <span>{precise.address} <span className="text-xs text-muted-foreground">(within {precise.accuracyM} m, they shared it)</span></span>],
              ["City", ip && [...new Set([ip.city, ip.region].filter(Boolean))].join(", ")],
              ["Country", ip?.country && `${ip.flag ? `${ip.flag} ` : ""}${ip.country}`],
              ["Postal code", ip?.postal],
              ["Their time", localTime(ip?.timeZone ?? client?.timeZone) && `${localTime(ip?.timeZone ?? client?.timeZone)} (${ip?.timeZone ?? client?.timeZone})`],
              ["Likely company", network === "business" && ip?.org && <span className="font-medium">{ip.org}</span>],
              [
                "Network",
                ip?.org && (
                  <span>
                    {ip.org}
                    {ip.domain ? <span className="text-muted-foreground"> · {ip.domain}</span> : null}
                    {network && <span className={`block text-xs ${network === "hosting" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>{NETWORK_LABEL[network]}</span>}
                  </span>
                ),
              ],
              // the provider often repeats the network's name; show it only when it says something new
              ["Provider", ip?.isp && !ip.org?.startsWith(ip.isp) ? ip.isp : undefined],
              ["IP address", info?.ip],
              ["Map", lat != null && lon != null && <a href={`https://www.google.com/maps?q=${lat},${lon}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open in Google Maps</a>],
            ]}
          />
          {!precise && ip && <p className="text-[11px] text-muted-foreground">From their IP address: right to the city, not the street.</p>}
        </Section>

        <Section title="Device">
          <Facts
            rows={[
              ["Device", device && [device.type, device.model].filter(Boolean).join(" · ")],
              ["System", device?.os],
              ["Browser", device?.browser],
              ["Screen", client?.screen && `${client.screen.w} × ${client.screen.h}${client.pixelRatio ? ` @${client.pixelRatio}x` : ""}`],
              ["Window", client?.viewport && `${client.viewport.w} × ${client.viewport.h}`],
              ["Hardware", [client?.cores && `${client.cores} CPU cores`, client?.memoryGb && `${client.memoryGb} GB+ memory`, client?.hints?.architecture && `${client.hints.architecture}${client.hints.bitness ? `-${client.hints.bitness}` : ""}`].filter(Boolean).join(" · ")],
              ["Touch", client?.touchPoints ? `Yes (${client.touchPoints} points)` : client ? "No" : undefined],
              ["Connection", client?.connection && [client.connection.type?.toUpperCase(), client.connection.downlinkMbps && `${client.connection.downlinkMbps} Mbps`, client.connection.saveData && "data saver"].filter(Boolean).join(" · ")],
              ["Language", client?.languages?.join(", ") ?? client?.language],
              ["Theme", client?.darkMode != null && (client.darkMode ? "Dark mode" : "Light mode")],
              ["Privacy", client?.doNotTrack && "Asks not to be tracked"],
            ]}
          />
        </Section>

        <Section title="Visit">
          <Facts
            rows={[
              ["Came from", client?.firstReferrer || info?.referrer ? host(client?.firstReferrer || info?.referrer) : info && "Typed the address or a bookmark"],
              ["Landed on", client?.landing && <a href={client.landing} target="_blank" rel="noreferrer" className="hover:underline">{pathOf(client.landing)}</a>],
              ["Campaign", Object.keys(campaign).length > 0 && Object.entries(campaign).map(([k, v]) => <span key={k} className="block">{k.replace(/^utm_/, "")}: {v}</span>)],
              ["Visits", client?.visits && `${client.visits}${client.visits === 1 ? " (first time)" : ""}`],
              ["First seen", client?.firstSeen && when(client.firstSeen)],
              ["Now on", <a key="now" href={chat.pageUrl} target="_blank" rel="noreferrer" className="hover:underline">{chat.pageTitle || pathOf(chat.pageUrl)}</a>],
            ]}
          />
        </Section>

        {!!info?.events.length && <SiteActions events={info.events} />}

        {!!info?.pages.length && <PagesVisited pages={info.pages} />}

        <Section title="Chat">
          <Facts
            rows={[
              ["Started", when(info?.createdAt)],
              ["Accepted", info?.acceptedAt && `${when(info.acceptedAt)}${chat.agent ? ` by ${chat.agent.name}` : ""}`],
              ["Ended", info?.closedAt && `${when(info.closedAt)}${info.closedBy === "visitor" ? " by the visitor" : info.closedBy === "agent" ? " by sales" : ""}`],
              ["Rating", info?.rating != null && <Stars value={info.rating} />],
              ["Feedback", info && (info.feedbackTags.length > 0 || info.feedback) && <span>{[...info.feedbackTags, info.feedback && `“${info.feedback}”`].filter(Boolean).join(" · ")}</span>],
            ]}
          />
        </Section>

        {!!info?.previous.length && (
          <Section title={`Earlier chats · ${info.previous.length}`}>
            <ul className="grid gap-1 text-sm">
              {info.previous.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  {web.data?.chats.some((x) => x.id === p.id) ? (
                    <Link href={`/chat/website?c=${p.id}`} className="text-primary hover:underline">
                      {when(p.createdAt)}
                    </Link>
                  ) : (
                    <span>{when(p.createdAt)}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{p.status === "closed" ? "ended" : p.status}</span>
                  {p.rating != null && <Stars value={p.rating} small />}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
