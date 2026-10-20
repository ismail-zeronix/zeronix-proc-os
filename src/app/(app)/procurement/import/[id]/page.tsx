import { requireApp } from "@/lib/auth/session";
import { ReviewClient } from "./review-client";

export const metadata = { title: "Review price list · Zeronix" };

export default async function ReviewPage({ params }: PageProps<"/procurement/import/[id]">) {
  await requireApp("procurement");
  const { id } = await params;
  return <ReviewClient id={Number(id)} />;
}
