import { requireApp } from "@/lib/auth/session";
import { getBrand, getHome } from "@/lib/website/settings";
import { HomeForm } from "./home-form";

export const metadata = { title: "Pages · Zeronix Website" };

export default async function WebsitePagesPage() {
  const { user } = await requireApp("website");
  const [home, brand] = await Promise.all([getHome(), getBrand()]);

  return (
    <div className="grid max-w-4xl gap-3">
      <div>
        <h1 className="text-sm font-semibold">Home page</h1>
        <p className="text-xs text-muted-foreground">The words on zeronixtech.com&apos;s home page.{user.role !== "admin" && " Only an admin can change them."}</p>
      </div>
      <HomeForm home={home} tagline={brand.tagline} siteUrl={process.env.SITE_PUBLIC_URL ?? "https://zeronixtech.com"} canEdit={user.role === "admin"} />
    </div>
  );
}
