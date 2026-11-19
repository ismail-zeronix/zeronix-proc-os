"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderEmail } from "@/lib/newsletter/render";
import type { NewsBrand, NewsDoc, ResolvedProduct } from "@/lib/newsletter/types";

export interface FieldEdit {
  id: string;
  key: string;
  idx: number | null;
  part: string | null;
  value: string;
  commit: boolean;
}
export type SectionAction = "up" | "down" | "dup" | "del" | "add" | "settings";

/**
 * The newsletter as it will look, drawn in a frame the person can click into: text is typed on directly and a toolbar sits
 * above the selected section. The frame can run scripts but has no access to the portal (no same-origin rights), so it can
 * only send messages; each one is checked to come from this frame. The design stays in the editor; the frame is only a view.
 */
export function Canvas({
  doc,
  products,
  brand,
  logoSrc,
  selectedId,
  phone,
  subject,
  preheader,
  onSelect,
  onField,
  onAction,
}: {
  doc: NewsDoc;
  products: ResolvedProduct[];
  brand: NewsBrand;
  logoSrc: string;
  selectedId: string | null;
  phone: boolean;
  subject: string;
  preheader: string;
  onSelect: (id: string | null) => void;
  onField: (m: FieldEdit) => void;
  onAction: (id: string, a: SectionAction) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const [height, setHeight] = useState(900);

  const html = useMemo(
    () => renderEmail({ doc, subject, preheader, products, brand, logoSrc, firstName: "", unsubUrl: "#", reason: "", edit: { selectedId } }).html,
    [doc, subject, preheader, products, brand, logoSrc, selectedId],
  );
  const latest = useRef(html);
  const sel = useRef(selectedId);
  const [initial] = useState(html);

  // keep the newest handlers without re-attaching the listener
  const handlers = useRef({ onSelect, onField, onAction });
  useEffect(() => {
    handlers.current = { onSelect, onField, onAction };
  });

  useEffect(() => {
    latest.current = html;
    sel.current = selectedId;
    if (ready.current) frame.current?.contentWindow?.postMessage({ nl: 1, t: "render", html, selected: selectedId }, "*");
  }, [html, selectedId]);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data as { nl?: number; t?: string; [k: string]: unknown } | null;
      if (!m || m.nl !== 1) return;
      if (m.t === "ready") {
        ready.current = true;
        frame.current?.contentWindow?.postMessage({ nl: 1, t: "render", html: latest.current, selected: sel.current }, "*");
      } else if (m.t === "height" && typeof m.h === "number") setHeight(Math.max(300, Math.min(m.h + 8, 20000)));
      else if (m.t === "select") handlers.current.onSelect(typeof m.id === "string" ? m.id : null);
      else if (m.t === "field" && typeof m.id === "string" && typeof m.key === "string" && typeof m.value === "string")
        handlers.current.onField({ id: m.id, key: m.key, idx: typeof m.idx === "number" ? m.idx : null, part: typeof m.part === "string" ? m.part : null, value: m.value, commit: m.commit === true });
      else if (m.t === "act" && typeof m.id === "string" && ["up", "down", "dup", "del", "add", "settings"].includes(m.act as string)) handlers.current.onAction(m.id, m.act as SectionAction);
    };
    window.addEventListener("message", on);
    // the frame may have finished loading before this page was ready to listen: ask it to say hello again
    frame.current?.contentWindow?.postMessage({ nl: 1, t: "ping" }, "*");
    return () => window.removeEventListener("message", on);
  }, []);

  return (
    <div className="mx-auto overflow-hidden rounded-md border bg-white shadow-sm" style={{ width: "100%", maxWidth: phone ? 390 : 640 }}>
      <iframe ref={frame} title="Newsletter editor" srcDoc={initial} sandbox="allow-scripts" scrolling="no" className="block w-full border-0" style={{ height }} />
    </div>
  );
}
