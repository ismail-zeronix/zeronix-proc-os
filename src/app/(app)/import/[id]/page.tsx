import { ReviewClient } from "./review-client";

export const metadata = { title: "Review price list · Zeronix Procurement" };

export default async function ReviewPage({ params }: PageProps<"/import/[id]">) {
  const { id } = await params;
  return <ReviewClient id={Number(id)} />;
}
