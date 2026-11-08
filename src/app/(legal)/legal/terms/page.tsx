import { TERMS } from "@/content/legal";
import { LegalPage } from "../legal-page";

export const metadata = { title: "Terms of service · ZeronixOS" };

export default function TermsPage() {
  return <LegalPage doc={TERMS} />;
}
