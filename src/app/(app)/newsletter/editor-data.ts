import "server-only";
import { newsBrand } from "@/lib/newsletter/brand";
import { listLists } from "@/lib/newsletter/data";
import { daysToSend, readyMailboxes } from "@/lib/newsletter/send";
import type { EditorList } from "./campaign-editor";

/** What the newsletter editor needs besides the newsletter itself: the lists (with how long each takes), the brand and the mailboxes ready to send. */
export async function editorContext() {
  const [lists, ready, { brand, previewSrc }] = await Promise.all([listLists(), readyMailboxes(), newsBrand()]);
  const options: EditorList[] = lists.map((l) => ({ id: l.id, name: l.name, active: l.active, days: ready.length ? daysToSend(l.active, ready) : null }));
  return { lists: options, brand, logoSrc: previewSrc, readyMailboxes: ready.length };
}
