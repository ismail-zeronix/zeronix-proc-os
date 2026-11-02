import type { Metadata } from "next";
import { PostList } from "@/components/content/post-list";
import { getPosts, getSettings } from "@/lib/api";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "IT services for UAE businesses",
  description: "IT AMC and support, networking and Wi-Fi, cybersecurity, CCTV, access control, AV, IP telephony and office setup across the UAE.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage({ searchParams }: PageProps<"/services">) {
  const page = Number((await searchParams).page) || 1;
  const [data, { brand }] = await Promise.all([getPosts({ kind: "services", page }), getSettings()]);
  return (
    <PostList
      brand={brand}
      data={data}
      page={page}
      base="/services"
      crumbs={[{ href: "/services", label: "Services" }]}
      tag="IT services"
      title="Build, secure and run your office IT"
      lead="One team for the network, the devices, security and support, planned around how your business works."
      chips={[]}
      empty="Service pages are on their way. Tell us what you need and we will reply with a plan and a quote."
    />
  );
}
