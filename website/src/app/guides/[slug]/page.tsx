import { PostPage, postMetadata } from "@/components/content/post-page";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">) {
  return postMetadata((await params).slug);
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  return <PostPage slug={(await params).slug} section="guides" />;
}
