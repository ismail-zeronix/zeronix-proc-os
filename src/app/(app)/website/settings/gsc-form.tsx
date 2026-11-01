"use client";

import { CheckCircle2, CircleAlert, Download, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importGscNowAction, saveGscAction, testGscAction } from "./actions";

export interface GscView {
  property: string;
  clientEmail: string;
  connected: boolean;
  lastImportAt: string | null;
  lastError: string;
  backfilled: boolean;
}

/** Search Console: the property and the service account key (write-only), with Test and Import now. */
export function GscForm({ gsc, canEdit }: { gsc: GscView; canEdit: boolean }) {
  const router = useRouter();
  const [property, setProperty] = useState(gsc.property || "sc-domain:zeronixtech.com");
  const [key, setKey] = useState("");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [importing, startImport] = useTransition();

  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {gsc.connected && !gsc.lastError ? (
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
        ) : (
          <CircleAlert className="size-4 text-amber-600" aria-hidden />
        )}
        <span className="font-medium">{gsc.connected ? `Connected as ${gsc.clientEmail}` : "Not connected"}</span>
        {gsc.lastImportAt && <span className="text-xs text-muted-foreground">Last import {new Date(gsc.lastImportAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>}
        {gsc.connected && !gsc.backfilled && <span className="text-xs text-muted-foreground">· 16-month history imports overnight</span>}
      </div>
      {gsc.lastError && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{gsc.lastError}</p>}

      <div className="grid gap-1.5">
        <Label htmlFor="gsc-property">Property</Label>
        <Input id="gsc-property" value={property} disabled={!canEdit} onChange={(e) => setProperty(e.target.value)} placeholder="sc-domain:zeronixtech.com" />
        <p className="text-xs text-muted-foreground">A domain property is &quot;sc-domain:zeronixtech.com&quot;; a URL property is &quot;https://zeronixtech.com/&quot; with the slash.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="gsc-key">Service account key (JSON)</Label>
        <Textarea
          id="gsc-key"
          rows={4}
          value={key}
          disabled={!canEdit}
          onChange={(e) => setKey(e.target.value)}
          placeholder={gsc.connected ? "Saved. Paste a new key only to replace it." : '{ "type": "service_account", "client_email": "…", "private_key": "…" }'}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Google Cloud › IAM › Service accounts › Keys › Add key (JSON). Then in Search Console › Settings › Users, add the service account&apos;s email with Restricted access. The key is stored encrypted and never shown again.
        </p>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            pending={saving}
            onClick={() =>
              startSave(async () => {
                const res = await saveGscAction({ property, key });
                if (res.error !== undefined) return void toast.error(res.error);
                setKey("");
                toast.success(`Saved for ${res.value.clientEmail}`);
                router.refresh();
              })
            }
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            pending={testing}
            disabled={!gsc.connected}
            onClick={() =>
              startTest(async () => {
                const res = await testGscAction();
                if (res.error !== undefined) return void toast.error(res.error);
                toast.success(`Works: ${res.value.rows} rows and ${res.value.clicks} clicks last week`);
              })
            }
          >
            <PlugZap /> Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            pending={importing}
            disabled={!gsc.connected}
            onClick={() =>
              startImport(async () => {
                const res = await importGscNowAction();
                if (res.error !== undefined) return void toast.error(res.error);
                toast.success(`Imported ${res.value.rows} rows (last 7 days)`);
                router.refresh();
              })
            }
          >
            <Download /> Import now
          </Button>
        </div>
      )}
    </div>
  );
}
