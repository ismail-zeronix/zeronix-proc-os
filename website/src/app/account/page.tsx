import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountView } from "@/components/store/account-view";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default function AccountPage() {
  return (
    <section className="container-site py-6 sm:py-8">
      <Suspense>
        <AccountView />
      </Suspense>
    </section>
  );
}
