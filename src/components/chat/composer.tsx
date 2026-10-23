"use client";

import { SendHorizontal, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MAX_BODY, tokensToText } from "@/lib/chat/text";
import type { ChatMessage } from "@/lib/chat/types";
import { pingTyping, resetTyping } from "./chat-data";
import { useChatStore } from "./chat-store";

/**
 * The message box under a conversation or a thread. Enter sends, Shift+Enter is a new line. The unsent text is kept per
 * conversation (`draftKey`), and the others see "typing…" while you write.
 */
export function Composer({
  channelId,
  draftKey,
  placeholder,
  replyTo,
  onCancelReply,
  onSend,
  disabled,
}: {
  channelId: number;
  draftKey: number;
  placeholder: string;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  onSend: (text: string) => void;
  disabled?: string;
}) {
  const draft = useChatStore((s) => s.drafts[draftKey] ?? "");
  const setDraft = useChatStore((s) => s.setDraft);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => input.current?.focus(), [draftKey, replyTo]);

  if (disabled) return <p className="border-t p-3 text-center text-xs text-muted-foreground">{disabled}</p>;

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft(draftKey, "");
    resetTyping(channelId);
    onSend(text);
  };

  return (
    <div className="border-t">
      {replyTo && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate border-l-2 border-primary/60 pl-2 text-muted-foreground">
            Replying to <span className="font-medium text-foreground">{replyTo.userName ?? "Portal"}</span>: {tokensToText(replyTo.body)}
          </span>
          <Button variant="ghost" size="icon-xs" onClick={onCancelReply} aria-label="Cancel reply">
            <X />
          </Button>
        </div>
      )}
      <form
        className="flex items-end gap-1.5 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          value={draft}
          onChange={(e) => {
            setDraft(draftKey, e.target.value);
            if (e.target.value.trim()) pingTyping(channelId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
            if (e.key === "Escape" && replyTo) {
              e.stopPropagation();
              onCancelReply?.();
            }
          }}
          rows={1}
          maxLength={MAX_BODY}
          placeholder={placeholder}
          aria-label={placeholder}
          className="field-sizing-content max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send" title="Send (Enter)">
          <SendHorizontal />
        </Button>
      </form>
    </div>
  );
}
