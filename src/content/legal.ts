/**
 * Terms of service and privacy notice of the SaaS (demo.zeronixos.online). DRAFTS written by the developer for the owner
 * to review with a lawyer: while `approved` is false every page says so at the top. Edit the text here, then set
 * `approved: true` and `effective` to the day it applies.
 */
export interface LegalDoc {
  title: string;
  approved: boolean;
  effective: string;
  sections: { heading: string; body: string[] }[];
}

const OPERATOR = "Zeronix (the operator of ZeronixOS)";
const CONTACT = "support@zeronixos.online";

export const TERMS: LegalDoc = {
  title: "Terms of service",
  approved: false,
  effective: "",
  sections: [
    {
      heading: "1. The service",
      body: [
        `ZeronixOS is business software provided by ${OPERATOR} as an online service: CRM, sales, accounting, projects, tasks, files and team chat for your company ("the service").`,
        "During the trial the service is provided by invitation, free of charge and as it is. Features may change while it is being developed.",
      ],
    },
    {
      heading: "2. Your account and your company's data",
      body: [
        "Your company's admin decides who in your company may use the service and what each person may see. Keep your password to yourself; you are responsible for what is done with your account.",
        "The data your company enters (customers, quotes, invoices, files and so on) belongs to your company. We use it only to provide the service to you and never sell it.",
        "Each company's data is kept apart from every other company's: other customers of the service cannot see it.",
      ],
    },
    {
      heading: "3. Support access",
      body: [
        "To help you, our support team can open your company's account. By default this is read only. Every visit is recorded with who, when and why, and your company's admin can see the list in Admin > Users.",
      ],
    },
    {
      heading: "4. Acceptable use",
      body: [
        "Do not use the service for anything unlawful, to send unsolicited bulk messages, to upload malware, or to try to reach data that is not yours. We may pause an account that does, and will tell its admin why.",
      ],
    },
    {
      heading: "5. Your obligations as a business",
      body: [
        "The service helps you prepare documents such as tax invoices and VAT returns. You remain responsible for their content and for your filings with the Federal Tax Authority; check them, or have your accountant check them, before you rely on them.",
      ],
    },
    {
      heading: "6. Availability, backups and liability",
      body: [
        "We back the service up daily and work to keep it available, but during the trial we do not promise any level of availability. Keep your own copies of documents you must retain by law (every list and document can be downloaded).",
        "To the extent the law allows, we are not liable for indirect losses or lost profits arising from use of the service.",
      ],
    },
    {
      heading: "7. Ending",
      body: [
        "Your company may stop using the service at any time. On request we provide an export of your company's data and then delete it, except where the law requires us to keep it.",
      ],
    },
    {
      heading: "8. Law and contact",
      body: [`These terms are governed by the laws of the United Arab Emirates (Emirate of Dubai). Questions: ${CONTACT}.`],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Privacy notice",
  approved: false,
  effective: "",
  sections: [
    {
      heading: "1. Who we are",
      body: [`${OPERATOR} runs ZeronixOS. For the data your company enters about its own customers and staff, your company is in charge of it and we process it on your company's behalf. Contact: ${CONTACT}.`],
    },
    {
      heading: "2. What we keep about you as a user",
      body: [
        "Your name, work email, the password (stored only as a one-way hash), your role, what you do in the service (an audit trail of changes), sign-ins with the network address, and attendance punches if your company uses them.",
      ],
    },
    {
      heading: "3. Why",
      body: ["To run the service for your company, to keep it secure (for example, blocking repeated wrong passwords), to support you, and to meet legal obligations."],
    },
    {
      heading: "4. Where and how it is kept",
      body: [
        "On servers we operate, in a database where each company's data is separated by the database itself. Saved passwords for connected mailboxes are encrypted. Connections are encrypted (HTTPS).",
        "We do not sell personal data and do not use it for advertising. We do not use third-party trackers in the service.",
      ],
    },
    {
      heading: "5. How long",
      body: ["For as long as your company uses the service; error logs and failed sign-in records for a short time (days to weeks). After a company leaves, its data is deleted on request, except what the law requires us to keep."],
    },
    {
      heading: "6. Your choices",
      body: [`Ask your company's admin, or us at ${CONTACT}, to see, correct or delete your personal data, subject to your company's own legal obligations.`],
    },
  ],
};
