import { notFound } from "next/navigation";
import { MessagePane } from "../message-pane";

export const metadata = { title: "Mail · Zeronix" };

export default async function MessagePage({ params }: PageProps<"/mail/[uid]">) {
  const uid = Number((await params).uid);
  if (!Number.isInteger(uid) || uid < 1) notFound();
  return <MessagePane uid={uid} />;
}
