import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireApp } from "@/lib/auth/session";
import { listSegments } from "@/lib/prospecting/data";
import { getSequence } from "@/lib/prospecting/outreach";
import { SequenceEditor } from "../sequence-editor";

export const metadata = { title: "Sequence · Zeronix Prospecting" };

/** Edit a sequence, or write a new one at /prospecting/sequences/new. */
export default async function SequencePage({ params }: PageProps<"/prospecting/sequences/[id]">) {
  await requireApp("prospecting");
  const raw = (await params).id;
  const segments = (await listSegments()).filter((s) => s.active).map((s) => ({ key: s.key, label: s.label }));
  let sequence: Parameters<typeof SequenceEditor>[0]["sequence"];
  if (raw !== "new") {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) notFound();
    const s = await getSequence(id);
    if (!s) notFound();
    sequence = { id: s.id, name: s.name, segmentKey: s.segmentKey ?? "", steps: s.steps.map((x) => ({ subject: x.subject, body: x.body, delayDays: x.delayDays })) };
  }
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback="/prospecting/sequences" />
        <h1 className="text-sm font-semibold">{sequence ? sequence.name : "New sequence"}</h1>
      </div>
      <SequenceEditor sequence={sequence} segments={segments} />
    </div>
  );
}
