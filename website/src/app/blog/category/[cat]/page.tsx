import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostList } from "@/components/content/post-list";
import { getPosts, getSettings } from "@/lib/api";

export async function generateMetadata({ params }: PageProps<"/blog/category/[cat]">): Promise<Metadata> {
  const cat = (await params).cat;
  return { title: `${cat.replace(/-/g, " ")}: articles`, alternates: { canonical: `/blog/category/${cat}` } };
}

export default async function BlogCategoryPage({ params, searchParams }: PageProps<"/blog/category/[cat]">) {
  const cat = (await params).cat;
  const page = Number((await searchParams).page) || 1;
  const [data, { brand }] = await Promise.all([getPosts({ category: cat, page }), getSettings()]);
  if (!data.total) notFound();
  const name = data.posts[0]?.category || cat;
  return (
    <PostList
      brand={brand}
      data={data}
      page={page}
      base={`/blog/category/${cat}`}
      crumbs={[
        { href: "/blog", label: "Blog" },
        { href: `/blog/category/${cat}`, label: name },
      ]}
      tag="Category"
      title={name}
      lead={`Everything we have written on ${name.toLowerCase()}.`}
      empty=""
    />
  );
}
