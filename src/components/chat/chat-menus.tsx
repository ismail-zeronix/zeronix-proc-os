"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { setChannelMute, setChatPrefs } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import type { ChannelSummary, ChatPrefsView, PresenceStatus } from "@/lib/chat/types";
import { TZ } from "@/lib/dates";
import { prefsKey, useMyPrefs } from "./alerts";
import { chatKeys } from "./chat-data";
import type { Me } from "./message-row";
import { STATUS_DOT, STATUS_LABEL } from "./panel-bits";

/** Minutes until 8:00 tomorrow, UAE time. */
function untilTomorrowMorning(): number {
  const now = new Date();
  const dubai = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const next = new Date(dubai);
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return Math.max(1, Math.round((next.getTime() - dubai.getTime()) / 60_000));
}

/** My face with my status dot; opens status (online, away, do not disturb) and alert settings. */
export function StatusMenu({ me }: { me: Me }) {
  const qc = useQueryClient();
  const prefs = useMyPrefs().data;
  const status: PresenceStatus = prefs?.status === "dnd" ? "dnd" : prefs?.status === "away" ? "away" : "online";

  const save = async (patch: Parameters<typeof setChatPrefs>[0], ok?: string) => {
    try {
      qc.setQueryData<ChatPrefsView>(prefsKey, await setChatPrefs(patch));
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleDesktop = async (on: boolean) => {
    if (on && typeof Notification === "undefined") return void toast.error("This browser cannot show notifications.");
    if (on && Notification.permission !== "granted") {
      const p = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
      if (p !== "granted") return void toast.error("The browser is blocking notifications for the portal. Allow them in the site settings (the icon left of the address).");
    }
    void save({ desktop: on });
  };

  const browserAllows = typeof Notification !== "undefined" && Notification.permission === "granted";
  const until = prefs?.dndUntil ? new Date(prefs.dndUntil).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Your status: ${STATUS_LABEL[status]}`} title={`You: ${STATUS_LABEL[status]}`} />}>
        <span className="relative">
          <UserAvatar name={me.name} size={22} />
          <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-popover ${STATUS_DOT[status]}`} />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {STATUS_LABEL[status]}
            {status === "dnd" && (until ? ` until ${until}` : " until you turn it off")}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem onClick={() => save({ status: "auto" }, "You show as online")}>
          <span className={`size-2.5 rounded-full ${STATUS_DOT.online}`} /> Online
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => save({ status: "away" }, "You show as away")}>
          <span className={`size-2.5 rounded-full ${STATUS_DOT.away}`} /> Away
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Do not disturb (no sounds or alerts)</DropdownMenuLabel>
        </DropdownMenuGroup>
        {(
          [
            ["For 1 hour", 60],
            ["For 4 hours", 240],
            ["Until tomorrow 8:00", untilTomorrowMorning()],
            ["Until I turn it off", null],
          ] as const
        ).map(([label, minutes]) => (
          <DropdownMenuItem key={label} onClick={() => save({ status: "dnd", dndMinutes: minutes }, "Do not disturb is on")}>
            <span className={`size-2.5 rounded-full ${STATUS_DOT.dnd}`} /> {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={prefs?.sound !== false} onCheckedChange={(on) => save({ sound: !!on })}>
          Sound for new messages
        </DropdownMenuCheckboxItem>
        {/* ticked only when it will really happen: switched on here and allowed by the browser */}
        <DropdownMenuCheckboxItem checked={prefs?.desktop !== false && browserAllows} onCheckedChange={(on) => void toggleDesktop(!!on)}>
          Desktop notifications
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Bell in a conversation's header: mute it for a while or for good (no sound or alert, grey unread count). */
export function MuteMenu({ channel }: { channel: ChannelSummary }) {
  const qc = useQueryClient();
  const mute = async (minutes: number | null, ok: string) => {
    try {
      await setChannelMute(channel.id, minutes);
      await qc.invalidateQueries({ queryKey: chatKeys.channels });
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={channel.muted ? "Muted. Change" : "Mute"} title={channel.muted ? "Muted" : "Mute"} />}>
        {channel.muted ? <BellOff className="text-muted-foreground" /> : <Bell />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {channel.muted ? (
          <DropdownMenuItem onClick={() => mute(0, "Unmuted")}>Unmute</DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={() => mute(60, "Muted for 1 hour")}>Mute for 1 hour</DropdownMenuItem>
            <DropdownMenuItem onClick={() => mute(8 * 60, "Muted for 8 hours")}>Mute for 8 hours</DropdownMenuItem>
            <DropdownMenuItem onClick={() => mute(null, "Muted")}>Mute until I turn it back on</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
