"use client";

import { CheckCheck, Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useSelection } from "@/components/data-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LOST_REASONS, STAGES } from "@/lib/sales";
import { type BulkResult, bulkAddAssignee, bulkDeleteCompanies, bulkDeleteContacts, bulkDeleteDeals, bulkMoveDeals } from "./actions";

const plural = (n: number, noun: string) => `${n} ${n === 1 ? noun : /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`}`;

/**
 * Runs one bulk action on the ticked rows, says what happened (and which rows were skipped, and why), clears the
 * selection and reloads the list.
 */
function useBulk(noun: string) {
  const router = useRouter();
  const sel = useSelection();
  const [pending, start] = useTransition();
  const run = (fn: (ids: number[]) => Promise<BulkResult>, verb: string, after?: () => void) =>
    start(async () => {
      let res: BulkResult;
      try {
        res = await fn(sel.ids);
      } catch {
        toast.error("Something went wrong and nothing was changed. Try again.");
        return;
      }
      if (res.error) return void toast.error(res.error);
      if (res.done) toast.success(`${plural(res.done, noun)} ${verb}`);
      if (res.skipped.length) {
        toast.warning(`${plural(res.skipped.length, noun)} skipped`, { description: res.skipped.slice(0, 5).join("\n") + (res.skipped.length > 5 ? `\n…and ${res.skipped.length - 5} more` : "") });
      }
      sel.clear();
      after?.();
      router.refresh();
    });
  return { sel, pending, run };
}

function ConfirmDelete({ open, onOpenChange, title, body, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Deals and leads: move to a stage (Lost asks why; Won is left out because each win asks for its quote), qualify
 * leads, add a person to the team (admins), delete. Each runs the same checks as doing it on one deal.
 */
export function DealBulkActions({ leads, users, canAssign }: { leads: boolean; users: { id: number; name: string }[]; canAssign: boolean }) {
  const noun = leads ? "lead" : "deal";
  const { sel, pending, run } = useBulk(noun);
  const [askLost, setAskLost] = useState(false);
  const [reason, setReason] = useState<string>(LOST_REASONS[0]);
  const [other, setOther] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const why = reason === "Other" ? `Other: ${other.trim()}` : reason;

  return (
    <>
      {leads && (
        <Button size="sm" pending={pending} onClick={() => run((ids) => bulkMoveDeals(ids, "requirement"), "qualified")} title="We know what, how many and by when: make them deals">
          <CheckCheck /> Qualify
        </Button>
      )}
      <NativeSelect
        size="sm"
        aria-label="Move to stage"
        value=""
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value;
          if (to === "lost") setAskLost(true);
          else if (to) run((ids) => bulkMoveDeals(ids, to), `moved to ${STAGES.find((s) => s.key === to)?.label ?? to}`);
        }}
      >
        <NativeSelectOption value="">Move to…</NativeSelectOption>
        {STAGES.filter((s) => s.key !== "won").map((s) => (
          <NativeSelectOption key={s.key} value={s.key}>
            {s.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {canAssign && (
        <NativeSelect
          size="sm"
          aria-label="Add a person to the team"
          value=""
          disabled={pending}
          onChange={(e) => {
            const u = users.find((x) => x.id === Number(e.target.value));
            if (u) run((ids) => bulkAddAssignee(ids, u.id), `now include ${u.name}`);
          }}
        >
          <NativeSelectOption value="">Add person…</NativeSelectOption>
          {users.map((u) => (
            <NativeSelectOption key={u.id} value={u.id}>
              {u.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
        <Trash2 /> Delete
      </Button>

      <Dialog open={askLost} onOpenChange={setAskLost}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why were {plural(sel.count, noun)} lost?</DialogTitle>
            <DialogDescription>The same reason is saved on each one.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-lost-reason">Reason</Label>
              <NativeSelect id="bulk-lost-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {LOST_REASONS.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {r}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {reason === "Other" && (
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-lost-other">Tell us more</Label>
                <Input id="bulk-lost-other" value={other} onChange={(e) => setOther(e.target.value)} />
              </div>
            )}
            <div className="flex gap-2">
              <Button pending={pending} disabled={reason === "Other" && !other.trim()} onClick={() => run((ids) => bulkMoveDeals(ids, "lost", why), "marked as lost", () => setAskLost(false))}>
                Mark as lost
              </Button>
              <Button variant="ghost" onClick={() => setAskLost(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDelete
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${plural(sel.count, noun)}?`}
        body="Each goes with its history, follow-up tasks and project. Deals with an order are kept; cancel the order instead. This cannot be undone; mark them as lost to keep the record."
        onConfirm={() => run(bulkDeleteDeals, "deleted")}
      />
    </>
  );
}

/** Contacts: write one email to the ticked people (Mail app), delete. */
export function ContactBulkActions({ emails, canMail }: { emails: Record<number, string>; canMail: boolean }) {
  const router = useRouter();
  const { sel, pending, run } = useBulk("contact");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const to = sel.ids.map((i) => emails[i]).filter(Boolean);
  return (
    <>
      {canMail && (
        <Button size="sm" variant="outline" disabled={pending || !to.length} title={to.length ? `Write to ${to.length} with an email address` : "None of them has an email address"} onClick={() => router.push(`/mail/compose?to=${encodeURIComponent(to.join(", "))}`)}>
          <Mail /> Email
        </Button>
      )}
      <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
        <Trash2 /> Delete
      </Button>
      <ConfirmDelete
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Remove ${plural(sel.count, "contact")}?`}
        body="They are removed from their companies. Deals they were on stay, without a contact person. This cannot be undone."
        onConfirm={() => run(bulkDeleteContacts, "removed")}
      />
    </>
  );
}

/** Companies: delete (admin only, like on the company page). */
export function CompanyBulkActions() {
  const { sel, pending, run } = useBulk("company");
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
        <Trash2 /> Delete
      </Button>
      <ConfirmDelete
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${plural(sel.count, "company")}?`}
        body="Each goes with all its contacts, deals and history. Companies with orders or invoices are kept. This cannot be undone."
        onConfirm={() => run(bulkDeleteCompanies, "deleted")}
      />
    </>
  );
}
