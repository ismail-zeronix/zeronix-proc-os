import { PostPage, postMetadata } from "@/components/content/post-page";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">) {
  return postMetadata((await params).slug);
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  return <PostPage slug={(await params).slug} section="blog" />;
}
