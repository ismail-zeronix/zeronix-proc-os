"use client";

import { ArrowUp, Bot, Check, Loader2, Mail, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignaturePreview } from "@/components/signature-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Brand, Person } from "@/lib/signature";
import { launchCampaign, previewPick, sampleEmail, type Sample } from "./actions";

type Step = "industry" | "size" | "offer" | "sample" | "followups" | "start" | "review" | "confirm" | "done";

interface Choice {
  label: string;
  hint?: string;
  run: () => void;
}

interface Message {
  id: number;
  from: "bot" | "me";
  text?: string;
  /** Extra content under the text: the picked prospects, an example email, the summary. */
  card?: React.ReactNode;
}

interface Capacity {
  mailboxes: { email: string; perDay: number; window: string; days: string[] }[];
  perDay: number;
  notTested: number;
}

const FOLLOW_UP_LABELS = ["No follow-ups", "1 follow-up after 3 working days", "2 follow-ups (after 3, then 5 working days)"];
const TWEAKS = ["Shorter", "More formal", "Friendlier", "Mention a free site visit"];

/**
 * The campaign as a short chat. The assistant asks one thing at a time with ready answers to click (or type), shows
 * who will be emailed and a real example written by AI, then creates the campaign. Nothing is saved before Launch.
 */
export function CampaignChat({
  industries,
  offers,
  capacity,
  backlog,
  aiReady,
  brand,
  person,
  logoSrc,
}: {
  industries: { industry: string; total: number; ready: number }[];
  offers: { label: string; offer: string }[];
  capacity: Capacity;
  backlog: number;
  aiReady: boolean;
  brand: Brand;
  person: Person;
  logoSrc: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<Step>("industry");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState("");
  const [text, setText] = useState("");
  const [campaignId, setCampaignId] = useState<number | null>(null);
  // the answers so far
  const a = useRef({ industry: "", take: 0, onlyReady: false, count: 0, offer: "", notes: [] as string[], index: 0, followUps: 1, start: "now", startLabel: "", review: false });
  const ids = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const say = (from: Message["from"], text?: string, card?: React.ReactNode) => setMessages((m) => [...m, { id: ++ids.current, from, text, card }]);
  const ask = (s: Step, question: string, opts: Choice[], card?: React.ReactNode) => {
    setStep(s);
    say("bot", question, card);
    setChoices(opts);
  };
  const answer = (label: string) => {
    setChoices([]);
    say("me", label);
  };

  useEffect(() => {
    // braces matter: newer browsers return a Promise from scrollIntoView, which React would take for a cleanup
    void end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, choices, busy]);

  // ---------- the questions, in order ----------

  const askIndustry = () => {
    if (!industries.length) {
      ask("industry", "No prospect has a confirmed email yet. Run Research on your prospects first (Research with AI finds owners and their emails), then come back here.", []);
      return;
    }
    ask(
      "industry",
      "Hi! Let's set up an email campaign. Which industry should we write to? Only prospects with at least one confirmed email are counted.",
      industries.map((i) => ({ label: i.industry, hint: `${i.total}${i.ready ? ` · ${i.ready} ready` : ""}`, run: () => pickIndustry(i) })),
    );
  };

  const pickIndustry = (i: (typeof industries)[number]) => {
    answer(i.industry);
    a.current.industry = i.industry;
    const opts: Choice[] = [{ label: `All ${i.total}`, run: () => pickSize(0, false, `All ${i.total}`) }];
    if (i.total > 25) opts.push({ label: "The best 25", run: () => pickSize(25, false, "The best 25") });
    if (i.total > 10) opts.push({ label: "The best 10", run: () => pickSize(10, false, "The best 10") });
    if (i.ready > 0 && i.ready < i.total) opts.push({ label: `Only the ${i.ready} ready ones`, run: () => pickSize(0, true, `Only the ${i.ready} ready ones`) });
    ask("size", `${i.total} ${i.industry === "Not sorted yet" ? "prospects without an industry" : `${i.industry} prospects`} have an email${i.ready ? `, ${i.ready} of them fully ready` : ""}. How many should we email? The best ones come first (ready, then by score). You can also type a number.`, opts);
  };

  const pickSize = async (take: number, onlyReady: boolean, label: string) => {
    answer(label);
    Object.assign(a.current, { take, onlyReady });
    setBusy("Looking them up…");
    const res = await previewPick({ industry: a.current.industry, take, onlyReady }).catch(() => null);
    setBusy("");
    if (!res || "error" in res || !res.value) {
      ask("size", res && "error" in res && res.error ? res.error : "That did not work. Try again.", choices);
      return;
    }
    a.current.count = res.value.count;
    const table = (
      <div className="grid gap-1 rounded-lg border bg-background p-2 text-xs">
        {res.value.rows.map((r) => (
          <div key={r.companyId} className="grid min-w-0 gap-x-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <span className="truncate font-medium">{r.name}</span>
            <span className="truncate text-muted-foreground" title={[r.to, ...r.cc].join(", ")}>
              <span className="text-foreground">To</span> {r.to}
              {r.cc.length > 0 && (
                <>
                  {" "}
                  · <span className="text-foreground">Cc</span> {r.cc.join(", ")}
                </>
              )}
            </span>
          </div>
        ))}
        {res.value.count > res.value.rows.length && <div className="text-muted-foreground">and {res.value.count - res.value.rows.length} more</div>}
      </div>
    );
    say("bot", `${res.value.count} prospects. Each gets one email: the owner or manager in To when we know them (else the company inbox), and every other address we found on Cc.`, table);
    askOffer();
  };

  const askOffer = () =>
    ask(
      "offer",
      "What are we offering them? One line is enough, for example \"CCTV and access control for property offices\". Type it, or pick one:",
      offers.slice(0, 6).map((o) => ({ label: o.label, hint: o.offer.slice(0, 60), run: () => pickOffer(o.offer) })),
    );

  const pickOffer = (offer: string) => {
    answer(offer);
    a.current.offer = offer;
    a.current.notes = [];
    a.current.index = 0;
    void writeSample();
  };

  const writeSample = async () => {
    if (!aiReady) {
      say("bot", "No AI provider is set up, so emails will use a simple template that you check in Review. Add OpenRouter (free) in Prospecting settings to have AI write each one.");
      askFollowUps();
      return;
    }
    setBusy("AI is writing an example email…");
    const res = await sampleEmail({ industry: a.current.industry, take: a.current.take, onlyReady: a.current.onlyReady, offer: a.current.offer, notes: a.current.notes, index: a.current.index }).catch(() => null);
    setBusy("");
    if (!res || "error" in res || !res.value) {
      const why = res && "error" in res && res.error ? res.error : "The example could not be written.";
      ask("sample", `${why.replace(/[.\s]*$/, ".")} You can try again, or carry on: each email is written in the background.`, [
        { label: "Try again", run: () => (answer("Try again"), void writeSample()) },
        { label: "Carry on without an example", run: () => (answer("Carry on"), askFollowUps()) },
      ]);
      return;
    }
    ask(
      "sample",
      `Here is the email AI wrote for ${res.value.company}. Every prospect gets their own, written from what we know about them. Happy with the style? Pick a change or type your own (for example "mention we are a Dell partner").`,
      [
        { label: "Looks good", run: () => (answer("Looks good"), askFollowUps()) },
        ...TWEAKS.map((t) => ({ label: t, run: () => tweak(t) })),
        { label: "Another company", run: () => (answer("Show another company"), (a.current.index += 1), void writeSample()) },
      ],
      <EmailCard sample={res.value} brand={brand} person={person} logoSrc={logoSrc} />,
    );
  };

  const tweak = (note: string) => {
    answer(note);
    a.current.notes = [...a.current.notes, note].slice(-6);
    void writeSample();
  };

  const askFollowUps = () =>
    ask(
      "followups",
      "If they don't reply, should we follow up? Follow-ups go in the same email thread, and stop as soon as anyone at the company replies.",
      FOLLOW_UP_LABELS.map((l, i) => ({ label: l, run: () => (answer(l), (a.current.followUps = i), askStart()) })),
    );

  const askStart = () => {
    const pick = (start: string, label: string) => {
      answer(label);
      Object.assign(a.current, { start, startLabel: label });
      askReview();
    };
    ask("start", "When should it start? Emails only go out in each mailbox's sending hours and daily limit, spread over the day.", [
      { label: "As soon as possible", run: () => pick("now", "As soon as possible") },
      { label: "Next working day", run: () => pick("tomorrow", "Next working day") },
    ]);
  };

  const askReview = () =>
    ask("review", "Last one: should each email go out by itself once AI has written it, or wait for you to check it in Review?", [
      { label: "Send automatically", hint: "every email still gets your signature", run: () => (answer("Send automatically"), (a.current.review = false), confirm()) },
      { label: "Let me check them first", run: () => (answer("Let me check them first"), (a.current.review = true), confirm()) },
    ]);

  const confirm = () => {
    const x = a.current;
    const days = capacity.perDay ? Math.ceil(x.count / capacity.perDay) : 0;
    const summary = (
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border bg-background p-3 text-xs">
        <dt className="text-muted-foreground">Who</dt>
        <dd>
          {x.count} {x.industry} prospects{x.onlyReady ? " (ready only)" : ""}
        </dd>
        <dt className="text-muted-foreground">Offer</dt>
        <dd>{x.offer}</dd>
        {x.notes.length > 0 && (
          <>
            <dt className="text-muted-foreground">Style</dt>
            <dd>{x.notes.join(", ")}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Follow-ups</dt>
        <dd>{FOLLOW_UP_LABELS[x.followUps]}</dd>
        <dt className="text-muted-foreground">Starts</dt>
        <dd>{x.startLabel}</dd>
        <dt className="text-muted-foreground">Before sending</dt>
        <dd>{x.review ? "You check each email in Review" : "Sent automatically once written"}</dd>
        <dt className="text-muted-foreground">From</dt>
        <dd>
          {capacity.mailboxes.length ? capacity.mailboxes.map((m) => `${m.email} (${m.perDay} a day now, ${m.window})`).join(", ") : <span className="text-amber-700 dark:text-amber-400">No sending mailbox is switched on and tested yet; emails wait until one is.</span>}
        </dd>
        {days > 0 && (
          <>
            <dt className="text-muted-foreground">Takes about</dt>
            <dd>
              {days} sending day{days === 1 ? "" : "s"} for the first emails{backlog ? ` (AI is also still writing ${backlog} from other campaigns)` : ""}
            </dd>
          </>
        )}
      </dl>
    );
    ask("confirm", "Here's the plan. Launch it?", [
      { label: "Launch campaign", run: () => void launch() },
      { label: "Start over", run: () => restart() },
    ], summary);
  };

  const launch = async () => {
    answer("Launch campaign");
    setBusy("Creating the campaign…");
    const x = a.current;
    const res = await launchCampaign({ industry: x.industry, take: x.take, onlyReady: x.onlyReady, offer: x.offer, notes: x.notes, followUps: x.followUps, start: x.start, review: x.review }).catch(() => null);
    setBusy("");
    if (!res || "error" in res || !res.value) {
      ask("confirm", res && "error" in res && res.error ? res.error : "The campaign could not be created. Try again.", [
        { label: "Try again", run: () => void launch() },
        { label: "Start over", run: () => restart() },
      ]);
      return;
    }
    const v = res.value;
    setCampaignId(v.campaignId);
    const reasons = [...new Set(v.skipped.map((s) => s.reason))];
    ask(
      "done",
      `Done. ${v.added} prospect${v.added === 1 ? " is" : "s are"} in the campaign${v.skipped.length ? `; ${v.skipped.length} skipped (${reasons.slice(0, 3).join("; ")})` : ""}. AI is writing their emails now, one by one, and ${x.review ? "they will wait for you in Review" : "each is scheduled as soon as it is written"}. Your admin email signature goes under every email.`,
      [],
    );
  };

  const restart = () => {
    setMessages([]);
    a.current = { industry: "", take: 0, onlyReady: false, count: 0, offer: "", notes: [], index: 0, followUps: 1, start: "now", startLabel: "", review: false };
    setCampaignId(null);
    askIndustry();
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    askIndustry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Typed answers: an industry name, a number of prospects, the offer, or a change to the example. */
  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    if (step === "industry") {
      const hit = industries.find((i) => i.industry.toLowerCase().includes(t.toLowerCase()));
      if (hit) return pickIndustry(hit);
      return say("bot", `I can't find "${t}". Pick one of the industries above.`);
    }
    if (step === "size") {
      const n = parseInt(t, 10);
      if (n > 0) return void pickSize(n, false, `The best ${n}`);
      return say("bot", "Type a number, or pick an option above.");
    }
    if (step === "offer") return pickOffer(t);
    if (step === "sample") return tweak(t);
    say("bot", "Please pick one of the options above.");
  };
  const typing = step === "industry" || step === "size" || step === "offer" || step === "sample";

  return (
    <section className="grid min-h-[70svh] grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-xl border bg-card">
      <div className="grid content-start gap-3 overflow-y-auto p-3 sm:p-4">
        {messages.map((m) =>
          m.from === "bot" ? (
            <div key={m.id} className="flex max-w-full gap-2">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="size-4" />
              </span>
              <div className="grid min-w-0 flex-1 gap-2">
                {m.text && <p className="text-sm whitespace-pre-line">{m.text}</p>}
                {m.card}
              </div>
            </div>
          ) : (
            <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground">
              {m.text}
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2 pl-9 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {busy}
          </div>
        )}
        {!busy && choices.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {choices.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.run}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm hover:border-primary hover:bg-primary/5"
              >
                <span className="truncate">{c.label}</span>
                {c.hint && <span className="truncate text-xs text-muted-foreground">{c.hint}</span>}
              </button>
            ))}
          </div>
        )}
        {step === "done" && campaignId && (
          <div className="flex flex-wrap gap-2 pl-9">
            <Button size="sm" nativeButton={false} render={<Link href={`/prospecting/campaigns/${campaignId}`} />}>
              <Mail /> Open the campaign
            </Button>
            <Button size="sm" variant="outline" onClick={restart}>
              <RotateCcw /> Another campaign
            </Button>
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="flex items-center gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Sparkles className="ml-1 size-4 shrink-0 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!typing || !!busy}
          placeholder={step === "offer" ? "What do we offer them?" : step === "sample" ? "Ask for a change, e.g. mention we are a Dell partner" : typing ? "Type an answer" : "Pick an option above"}
          className="h-9 border-0 shadow-none focus-visible:ring-0"
          aria-label="Your answer"
        />
        <Button type="submit" size="icon-sm" disabled={!typing || !text.trim() || !!busy} aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
    </section>
  );
}

/** The example email as the prospect will see it: To, Cc, subject, text and the signature. */
function EmailCard({ sample, brand, person, logoSrc }: { sample: Sample; brand: Brand; person: Person; logoSrc: string }) {
  return (
    <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm">
      <div className="grid gap-0.5 text-xs text-muted-foreground">
        <div className="truncate">
          <span className="text-foreground">To</span> {sample.to}
        </div>
        {sample.cc.length > 0 && (
          <div className="truncate">
            <span className="text-foreground">Cc</span> {sample.cc.join(", ")}
          </div>
        )}
        <div className="truncate font-medium text-foreground">{sample.subject}</div>
      </div>
      <p className="whitespace-pre-line">{sample.body}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          <Check className="mr-1 inline size-3.5" />
          Signature from Admin settings is added under it
        </summary>
        <div className="mt-2">
          <SignaturePreview brand={brand} person={person} logoSrc={logoSrc} />
        </div>
      </details>
      <div className="text-[11px] text-muted-foreground">Written by {sample.model}</div>
    </div>
  );
}
