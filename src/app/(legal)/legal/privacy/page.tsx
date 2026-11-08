import { PRIVACY } from "@/content/legal";
import { LegalPage } from "../legal-page";

export const metadata = { title: "Privacy notice · ZeronixOS" };

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} />;
}
