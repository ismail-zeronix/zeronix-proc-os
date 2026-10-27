"use client";

import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RichDoc } from "@/lib/proposal";

/** Links people may add: web pages, email and phone. Anything else (javascript:, data:) is refused. */
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
    }),
  });
  const btn = (on: boolean, label: string, icon: React.ReactNode, act: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      // keep the cursor in the text: a click on the toolbar must not take the focus away
      onMouseDown={(e) => e.preventDefault()}
      onClick={act}
      className={`inline-flex size-7 items-center justify-center rounded-md [&_svg]:size-3.5 ${on ? "bg-neutral-200 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100"}`}
    >
      {icon}
    </button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="absolute -top-9 left-0 z-10 hidden items-center gap-0.5 rounded-lg border border-neutral-200 bg-white p-0.5 shadow-sm group-focus-within/rich:flex print:hidden" role="toolbar" aria-label="Text formatting">
      {btn(s.bold, "Bold (Ctrl B)", <Bold />, () => c().toggleBold().run())}
      {btn(s.italic, "Italic (Ctrl I)", <Italic />, () => c().toggleItalic().run())}
      {btn(s.underline, "Underline (Ctrl U)", <Underline />, () => c().toggleUnderline().run())}
      <span className="mx-0.5 h-4 w-px bg-neutral-200" />
      {btn(s.bullet, "Bullet list", <List />, () => c().toggleBulletList().run())}
      {btn(s.ordered, "Numbered list", <ListOrdered />, () => c().toggleOrderedList().run())}
      <span className="mx-0.5 h-4 w-px bg-neutral-200" />
      {btn(!s.center && !s.right, "Align left", <AlignLeft />, () => c().setTextAlign("left").run())}
      {btn(s.center, "Centre", <AlignCenter />, () => c().setTextAlign("center").run())}
      {btn(s.right, "Align right", <AlignRight />, () => c().setTextAlign("right").run())}
      <span className="mx-0.5 h-4 w-px bg-neutral-200" />
      {btn(s.link, s.link ? "Change or remove the link" : "Add a link", <Link2 />, () => {
        const was = (editor.getAttributes("link").href as string | undefined) ?? "";
        const href = window.prompt("Link (https://…, mailto: or tel:). Leave empty to remove it.", was);
        if (href === null) return;
        if (!href.trim()) return void c().extendMarkRange("link").unsetLink().run();
        if (!SAFE_LINK.test(href.trim())) return void window.alert("Links must start with https://, http://, mailto: or tel:");
        c().extendMarkRange("link").setLink({ href: href.trim() }).run();
      })}
    </div>
  );
}

/**
 * Rich text for a block: paragraphs, bold / italic / underline, lists, links and alignment. The toolbar shows while
 * typing. Typing "/" in an empty box opens the block menu (\`onSlash\`). The content is only read at start: to replace it
 * from outside, remount with a new key.
 */
export function RichText({
  value,
  onChange,
  placeholder = "Write here, or type / to add a block",
  onSlash,
  className = "",
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  placeholder?: string;
  onSlash?: () => void;
  className?: string;
}) {
  const slash = useRef(onSlash);
  useEffect(() => {
    slash.current = onSlash;
  }, [onSlash]);
  const editor = useEditor({
    // the page is rendered on the server first; the editor only starts in the browser
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto", "tel"], isAllowedUri: (url) => SAFE_LINK.test(url) },
      }),
      TextAlign.configure({ types: ["paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: value as JSONContent,
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichDoc),
    editorProps: {
      attributes: { class: `proposal-rich outline-none ${className}` },
      handleKeyDown: (view, event) => {
        if (event.key === "/" && slash.current && view.state.doc.textContent === "" && view.state.doc.childCount <= 1) {
          slash.current();
          return true;
        }
        return false;
      },
    },
  });
  return (
    <div className="group/rich relative">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {!editor && <div className={`proposal-rich min-h-6 ${className}`} />}
    </div>
  );
}
