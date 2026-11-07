"use client";

import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useSelection } from "@/components/data-table";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";

/** What can be done with ticked rows on any Accounts list: take them to Excel or CSV, or print them. */
export function ExportActions({ list }: { list: string }) {
  const { ids } = useSelection();
  const q = `list=${encodeURIComponent(list)}&ids=${ids.join(",")}`;
  return (
    <>
      <ExportButton variant="outline" size="sm" url={`/api/accounts/export?${q}&format=xlsx`} label={`${ids.length} selected (Excel)`}>
        <FileSpreadsheet /> Excel
      </ExportButton>
      <ExportButton variant="outline" size="sm" url={`/api/accounts/export?${q}&format=csv`} label={`${ids.length} selected (CSV)`}>
        <FileText /> CSV
      </ExportButton>
      <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/print/list/${encodeURIComponent(list)}?ids=${ids.join(",")}`} target="_blank" rel="noopener" />}>
        <Printer /> Print
      </Button>
    </>
  );
}
