import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardContent className="grid justify-items-center gap-3 py-10 text-center">
        <SearchX className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">We couldn&apos;t find that</p>
          <p className="text-sm text-muted-foreground">It may have been deleted, or the link is wrong.</p>
        </div>
        <div className="flex gap-2">
          <Button nativeButton={false} render={<Link href="/procurement/compare" />}>
            Compare prices
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/procurement" />}>
            Overview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
