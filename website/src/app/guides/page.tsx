import type { Metadata } from "next";
import { PostList } from "@/components/content/post-list";
import { getNav, getPosts, getSettings } from "@/lib/api";

export const metadata: Metadata = {
  title: "Buying guides for business IT in the UAE",
  description: "Which laptop, desktop, workstation or server fits your industry: researched guides and comparisons of UAE models, with specs and B2B pricing.",
  alternates: { canonical: "/guides" },
};

export default async function GuidesPage({ searchParams }: PageProps<"/guides">) {
  const sp = await searchParams;
  const industry = typeof sp.industry === "string" ? sp.industry : undefined;
  const page = Number(sp.page) || 1;
  const [data, { brand }, nav] = await Promise.all([getPosts({ kind: "guides", industry, page }), getSettings(), getNav()]);
  return (
    <PostList
      brand={brand}
      data={data}
      page={page}
      base={industry ? `/guides?industry=${industry}` : "/guides"}
      crumbs={[{ href: "/guides", label: "Guides" }]}
      tag="Buying guides"
      title="Choose the right machine for the job"
      lead="Guides and comparisons for each industry: what matters, which UAE models fit, and how they compare."
      chips={[{ href: "/guides", label: "All industries", active: !industry }, ...nav.industries.map((i) => ({ href: `/guides?industry=${i.slug}`, label: i.name, active: industry === i.slug }))]}
      empty="The first guides are on their way."
    />
  );
}
