"use client";

import { MessageCircle, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ago } from "@/lib/format";
import { errorText } from "@/lib/user-error";
import { assignInboxMessage, discardInboxMessage } from "./actions";

interface Message {
  id: number;
  chat: string;
  senderName: string;
  senderPhone: string;
  messageAt: string;
  preview: string;
  lines: number;
}

/** A message from a sender we do not know: say which supplier it is (or add them), or throw it away. */
export function UnknownSender({ message: m, suppliers, types }: { message: Message; suppliers: { id: number; name: string }[]; types: { key: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supplierId, setSupplierId] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(m.senderName && !/^[+\d\s()-]+$/.test(m.senderName) ? m.senderName : "");
  const [type, setType] = useState("other");

  const run = (fn: () => Promise<unknown>, ok: (r: unknown) => string) =>
    start(async () => {
      try {
        const r = await fn();
        toast.success(ok(r));
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  const assign = () =>
    run(
      () => assignInboxMessage({ inboxId: m.id, ...(adding ? { newSupplierName: name, newSupplierType: type } : { supplierId: Number(supplierId) }) }),
      (r) => {
        const { supplier, results } = r as Awaited<ReturnType<typeof assignInboxMessage>>;
        const saved = results.reduce((s, x) => s + x.saved, 0);
        const check = results.reduce((s, x) => s + x.needCheck, 0);
        return `${supplier}: ${results.length} message${results.length === 1 ? "" : "s"} filed, ${saved} line${saved === 1 ? "" : "s"} saved${check ? `, ${check} to check` : ""}. Their next messages go straight in.`;
      },
    );

  const sender = [m.senderName, m.senderPhone && m.senderPhone !== m.senderName ? m.senderPhone : ""].filter(Boolean).join(" · ") || "Unknown sender";

  return (
    <div className="grid gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <MessageCircle className="size-4 text-muted-foreground" />
        <span className="font-medium">{sender}</span>
        {m.chat && m.chat !== m.senderName && <span className="text-xs text-muted-foreground">in {m.chat}</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          {m.lines} line{m.lines === 1 ? "" : "s"} · {ago(m.messageAt)}
        </span>
      </div>
      <pre className="max-h-32 overflow-auto rounded-md bg-muted/60 p-2 text-xs whitespace-pre-wrap">{m.preview}</pre>
      <div className="flex flex-wrap items-center gap-2">
        {adding ? (
          <>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New supplier name" aria-label="New supplier name" className="h-8 w-56" />
            <NativeSelect size="sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Supplier type" className="w-auto">
              {types.map((t) => (
                <NativeSelectOption key={t.key} value={t.key}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button size="sm" pending={pending} disabled={name.trim().length < 2} onClick={assign}>
              <UserPlus /> Add supplier and file
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <NativeSelect size="sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Which supplier is this?" className="w-56">
              <NativeSelectOption value="">This is…</NativeSelectOption>
              {suppliers.map((s) => (
                <NativeSelectOption key={s.id} value={String(s.id)}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button size="sm" pending={pending} disabled={!supplierId} onClick={assign}>
              File it
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <UserPlus /> New supplier
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="ml-auto text-destructive" pending={pending} onClick={() => run(() => discardInboxMessage(m.id), () => "Message thrown away")}>
          <Trash2 /> Not stock
        </Button>
      </div>
    </div>
  );
}
