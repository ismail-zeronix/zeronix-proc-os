import type { Metadata } from "next";
import { PostList } from "@/components/content/post-list";
import { getPosts, getSettings } from "@/lib/api";

export const metadata: Metadata = {
  title: "Blog: business IT in the UAE",
  description: "News and practical advice on business laptops, desktops, workstations, servers and IT for UAE companies.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage({ searchParams }: PageProps<"/blog">) {
  const page = Number((await searchParams).page) || 1;
  const [data, { brand }] = await Promise.all([getPosts({ kind: "articles", page }), getSettings()]);
  return (
    <PostList
      brand={brand}
      data={data}
      page={page}
      base="/blog"
      crumbs={[{ href: "/blog", label: "Blog" }]}
      tag="Blog"
      title="Notes on business IT"
      lead="Practical advice, news and how-tos for UAE teams buying and running business IT."
      empty="The first posts are on their way."
    />
  );
}
