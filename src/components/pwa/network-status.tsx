"use client";

import { RotateCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * A slim bar at the top while the device has no connection (nothing typed is saved until it is back), and a short
 * "Back online" note when it returns, with the page's data read again.
 */
export function NetworkStatus() {
  const router = useRouter();
  // the server and the first render assume online, so nothing flashes
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online", { id: "network", duration: 2500 });
      router.refresh();
    }
  }, [online, router]);

  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-3 pt-[env(safe-area-inset-top)] text-xs font-medium text-amber-950"
    >
      <span className="flex min-h-8 items-center gap-2">
        <WifiOff className="size-3.5 shrink-0" />
        You&apos;re offline. Changes won&apos;t be saved until the connection is back.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex min-h-8 items-center gap-1 rounded px-2 underline-offset-2 hover:underline"
      >
        <RotateCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}
