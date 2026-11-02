import { PostPage, postMetadata } from "@/components/content/post-page";

export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/services/[slug]">) {
  return postMetadata((await params).slug);
}

export default async function ServicePage({ params }: PageProps<"/services/[slug]">) {
  return <PostPage slug={(await params).slug} section="services" />;
}
