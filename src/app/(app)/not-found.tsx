import { SearchX } from "lucide-react";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <>
      <PortalHeader />
      <Card className="mx-auto mt-10 max-w-lg">
        <CardContent className="grid justify-items-center gap-3 py-10 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">We couldn&apos;t find that</p>
            <p className="text-sm text-muted-foreground">
              It may have been deleted, the link is wrong, or you do not have access to it.
            </p>
          </div>
          <Button nativeButton={false} render={<Link href="/" />}>
            Back to home
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
