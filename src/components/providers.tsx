"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { NavTracker } from "@/components/back-button";
import { NetworkStatus } from "@/components/pwa/network-status";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
        <NavTracker />
        <ServiceWorkerRegister />
        <NetworkStatus />
        {/* on phones the toasts stay below the notch and the status bar of the installed app */}
        <Toaster richColors position="top-right" mobileOffset={{ top: "calc(env(safe-area-inset-top) + 16px)" }} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
