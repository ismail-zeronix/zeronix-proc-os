import type { Article } from "./types";

const REVIEWED = "2026-10-21";

export const SALES: Article[] = [
  {
    slug: "dealing-with-corporates",
    section: "sales",
    title: "Dealing with corporates",
    summary: "Who decides, how an RFQ and LPO work, vendor registration, payment terms and how to be easy to buy from.",
    tags: ["corporate", "rfq", "lpo", "vendor", "procurement", "tender", "payment terms", "credit", "pdc", "decision maker"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Know who is who" },
      {
        ul: [
          "User: the person who will use the equipment. They describe the need.",
          "IT manager: decides the technical spec (brand, model, warranty, standards).",
          "Procurement / purchasing: runs the quotation process, compares suppliers, negotiates price and terms.",
          "Finance: approves payment, checks the invoice, TRN and VAT.",
          "Decision maker / budget holder: signs the approval. In a small company this is the owner; in a large one it may be a manager or committee.",
        ],
      },
      {
        tip: "Never rely on one contact. Get to know the IT person and the buyer, and find out who signs. A deal with one contact stalls when that person goes on leave.",
      },
      { h: "How a corporate purchase usually flows" },
      {
        ol: [
          "Need: IT or a department raises a request.",
          "RFQ (request for quotation): procurement sends the spec to two to five suppliers.",
          "Quotation: you reply with price, availability, delivery time, warranty, payment terms and validity.",
          "Clarification and negotiation: questions on spec, price, delivery and terms.",
          "Approval: internal sign-off, sometimes with a comparison sheet.",
          "LPO (local purchase order): the formal order. Do not deliver on a verbal promise.",
          "Delivery, delivery note signed and stamped, invoice, payment.",
        ],
      },
      { h: "Vendor registration and terms" },
      {
        ul: [
          "Many large companies, banks, hospitals, schools and government bodies require supplier registration first. They ask for a trade licence, TRN certificate, bank details, company profile and sometimes references. Keep a ready \"supplier pack\".",
          "Payment terms: advance, cash on delivery, or credit (30, 60 or 90 days) are common. Post-dated cheques (PDC) are still used in the UAE. Agree the terms in writing on the quotation.",
          "Quotation validity: IT prices move. Put a short validity (for example 3 to 7 days) and state stock status.",
          "Always state: brand, model, part number, quantity, unit price, VAT, delivery time, warranty, validity and payment terms.",
        ],
      },
      { h: "Be easy to buy from" },
      {
        ul: [
          "Reply fast, even if only to say \"quote coming by 3 pm\".",
          "Send one clear quotation, not five messages.",
          "Offer an alternative when a model is out of stock, and say why it is equivalent.",
          "Confirm delivery date and keep it. Reliability is what makes a corporate come back.",
          "Follow up after delivery: is everything working, any issue with the invoice?",
        ],
      },
    ],
  },
  {
    slug: "how-to-talk",
    section: "sales",
    title: "How to talk to a customer",
    summary: "Opening lines, discovery questions, and short answers to the objections you will hear every week.",
    tags: ["call", "script", "opening", "discovery", "questions", "objection", "price", "follow up", "whatsapp", "email"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Opening a call or message" },
      {
        ul: [
          "Say who you are and why you are calling in one sentence: \"Hello, this is [name] from Zeronix. We supply business laptops and servers in the UAE. Do you buy IT hardware for your company?\"",
          "Ask permission for time: \"Do you have two minutes now, or should I call you later today?\"",
          "On WhatsApp: short, polite, one question. \"Hi [name], this is [name] from Zeronix. Are you planning any laptop or server purchase in the next few months?\"",
        ],
      },
      { h: "Discovery: ask before you quote" },
      {
        ol: [
          "What are you looking to buy, and how many?",
          "What is it for (which team, which software)?",
          "When do you need it, and is there a fixed deadline?",
          "Do you have a preferred brand or an existing fleet?",
          "Who else is involved in the decision?",
          "Do you have a budget in mind?",
          "Have you asked other suppliers, and what matters most to you: price, delivery time, warranty or service?",
        ],
      },
      { h: "Objections and short answers" },
      {
        table: {
          head: ["They say", "What it often means", "A good reply"],
          rows: [
            [
              "\"Your price is high.\"",
              "They are comparing with someone, or testing you.",
              "\"Which model and which price are you comparing with? Let me check the exact specification and warranty so we compare the same thing.\" Then show what is included: warranty, delivery, support.",
            ],
            [
              "\"We already have a supplier.\"",
              "Comfortable with the current one.",
              "\"That is good to hear. Many of our customers also keep us as a second quote, so you always have a comparison and a backup when stock is short. May I send you our next quotation?\"",
            ],
            [
              "\"Send me an email.\"",
              "Polite brush-off, or genuinely busy.",
              "\"Of course. So that it is useful, what model or specification should I include, and by when do you decide?\" Then send it and book a follow-up time.",
            ],
            [
              "\"We will think about it.\"",
              "Missing information or no urgency.",
              "\"Sure. Is there anything missing that would help you decide? I can call you on [day] to answer any questions.\"",
            ],
            [
              "\"Can you give a discount?\"",
              "Standard negotiation.",
              "Ask what quantity or payment terms they can offer. \"If you confirm today / take 20 units / pay on delivery, I can check a better price.\" Never discount without getting something back.",
            ],
          ],
        },
      },
      { h: "After the call" },
      {
        ul: [
          "Write down who you spoke to, what they need, and the next step with a date. Memory fails by the afternoon.",
          "Send a short confirmation message the same day.",
          "Set a follow-up task before you close the call. Most deals are won on the second and third follow-up.",
        ],
      },
      { tip: "End every conversation with a next step that has a date: \"I will send the quotation by 3 pm today, and call you tomorrow at 11.\"" },
    ],
  },
  {
    slug: "genuine-lead",
    section: "sales",
    title: "Is this lead genuine?",
    summary: "A checklist to tell a real buyer from a time-waster or a scam in the first conversation.",
    tags: ["genuine", "lead", "qualify", "scam", "fraud", "verify", "trn", "trade licence", "red flags", "bant"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "Not every enquiry is a buyer. Spending an hour on a quotation for someone who cannot buy costs you a real deal. Use these checks in the first call. The lead form in Sales has the same ticks.",
      },
      { h: "The four questions (need, authority, budget, timing)" },
      {
        table: {
          head: ["Check", "Ask", "Good sign"],
          rows: [
            ["Clear need", "What exactly, how many, what for?", "Specific models or specification and quantity"],
            ["Authority", "Who approves this? Are you the buyer?", "Talking to the buyer or decision maker, or they name who is"],
            ["Budget", "Is the budget approved? Roughly what range?", "A number or an approved budget, even if rough"],
            ["Timing", "When do you need delivery? When do you decide?", "A date, a project, an end of quarter"],
          ],
        },
      },
      { h: "Verify the company" },
      {
        ul: [
          "Email domain matches the company website. Be careful with free addresses (Gmail, Yahoo) for a company that claims to be large.",
          "Ask for the trade licence number and check it with the issuing authority (the Dubai economy department, the free zone, or the emirate's licensing authority).",
          "Ask for the TRN and verify it on the Federal Tax Authority's website.",
          "Find the company online: website, LinkedIn page, office address. A real business is easy to find.",
          "Call back on the landline or switchboard number on the website, not only on the mobile number they gave you.",
          "For a first large order, ask for an LPO on company letterhead with signature and stamp, and consider advance payment or a smaller first order before giving credit.",
        ],
      },
      { h: "Red flags" },
      {
        ul: [
          "Extreme urgency with no reason: \"I need 50 laptops tomorrow.\"",
          "Only asks for the lowest price, never asks about spec, warranty or delivery.",
          "Refuses a phone call or a video meeting.",
          "Names, email domains or licence details do not match.",
          "Asks you to pay a courier, agent, clearance or \"registration\" fee first, or to send money before goods are agreed. This is a known scam pattern. Never pay anything to get an order.",
          "Wants delivery to a freight forwarder or abroad with payment to a third party.",
          "Wants a very large order on credit on the first deal.",
        ],
      },
      {
        tip: "Hot lead: need, authority, budget and timing all confirmed, and the company checks out. Warm: two or three confirmed. Cold: just an enquiry. Spend your time in that order.",
      },
    ],
  },
  {
    slug: "sales-mindset",
    section: "sales",
    title: "Sales mindset and daily routine",
    summary: "How to think about no, follow-up, discipline and trust, plus a simple daily routine.",
    tags: ["mindset", "motivation", "discipline", "routine", "follow up", "closing", "rejection", "habits"],
    reviewed: REVIEWED,
    blocks: [
      { h: "The mindset" },
      {
        ul: [
          "A no is information, not a verdict. Ask why, note it, and move to the next call.",
          "Most deals are won by follow-up. One call is rarely enough; plan for several.",
          "Trust beats price over time. Customers pay a little more for the supplier that answers, delivers and fixes problems.",
          "Be curious about the customer's business. The better you understand their problem, the less you sell on price alone.",
          "Do what you promised, when you promised. Your reputation is every delivery.",
          "Ask for the order. If you never ask, many customers will not decide.",
          "Honesty closes more deals than cleverness. If you do not know, say \"I will find out\" and come back quickly.",
        ],
      },
      { h: "A simple daily routine" },
      {
        ol: [
          "Start of day (10 minutes): open Home, check tasks due today, emails and new enquiries. Pick your top three.",
          "First hour: replies to waiting customers and quotations that are due.",
          "Prospecting block (60 to 90 minutes): calls and messages to new and existing leads. Set a number, for example 15 calls.",
          "Midday: follow-ups on open quotations. Anything older than three days without a reply gets a call.",
          "Afternoon: sourcing prices (Procurement > Compare), preparing quotes, updating deals.",
          "End of day (10 minutes): update the deals, log notes, add tomorrow's follow-up tasks.",
        ],
      },
      { h: "Weekly" },
      {
        ul: [
          "Review your pipeline: what moved, what is stuck, what to drop.",
          "Count: new leads, quotations sent, deals won and lost. Numbers show where to improve.",
          "Pick two customers to reach out to just to check in, with no sale attached.",
        ],
      },
      { tip: "Discipline beats mood. Make the calls you planned, especially on the days you do not feel like it." },
    ],
  },
];
