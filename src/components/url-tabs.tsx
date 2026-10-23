"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface UrlTab {
  key: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

/** Tabs whose open tab is kept in the address (`?tab=`), so a reload or a shared link lands on the same one. */
export function UrlTabs({ tabs, initial }: { tabs: UrlTab[]; initial?: string | string[] }) {
  const first = tabs.find((t) => t.key === initial)?.key ?? tabs[0].key;
  return (
    <Tabs
      className="min-w-0"
      defaultValue={first}
      onValueChange={(v) => {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", String(v));
        window.history.replaceState(null, "", url);
      }}
    >
      <TabsList className="justify-start">
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.icon} {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key} className="pt-1">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
