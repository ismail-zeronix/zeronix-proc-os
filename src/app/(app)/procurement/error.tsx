"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardContent className="grid justify-items-center gap-3 py-10 text-center">
        <AlertTriangle className="size-8 text-amber-600" />
        <div>
          <p className="font-medium">This page could not load</p>
          <p className="text-sm text-muted-foreground">
            Something went wrong while getting the data. Your pasted text and edits are kept in this browser.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/procurement" />}>
            Go to overview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
