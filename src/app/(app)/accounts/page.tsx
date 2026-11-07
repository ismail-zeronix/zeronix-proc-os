import { Suspense } from "react";
import { DashboardBoard } from "@/components/dashboard/board";
import { Widget, WidgetSkeleton } from "@/components/dashboard/widgets";
import { Segmented } from "@/components/segmented";
import { dashboardLayout } from "@/lib/accounts-dashboard";
import { requireApp } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { currentOrgId } from "@/lib/org";
import { periodRange } from "@/lib/reports";
import { param } from "@/lib/sales-base";

export const metadata = { title: "Accounts · Zeronix" };

const PERIODS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "this-quarter", label: "This quarter" },
  { key: "this-year", label: "This year" },
  { key: "last-year", label: "Last year" },
];

/** The Accounts overview: each person's own arrangement of ready-made widgets, for the period picked at the top. */
export default async function AccountsOverview({ searchParams }: PageProps<"/accounts">) {
  const access = await requireApp("accounts");
  const asked = param((await searchParams).period) ?? "";
  const period = periodRange(PERIODS.some((p) => p.key === asked) ? asked : "this-month", dubaiToday());
  const [layout, orgId] = await Promise.all([dashboardLayout(access.user.id, access.accountant), currentOrgId()]);
  const context = { access, orgId, period };
  const slots = Object.fromEntries(
    layout.map((p) => [
      p.id,
      <Suspense key={p.id} fallback={<WidgetSkeleton id={p.id} />}>
        <Widget id={p.id} context={context} />
      </Suspense>,
    ]),
  );
  return (
    <DashboardBoard
      initial={layout}
      slots={slots}
      accountant={access.accountant}
      toolbar={<Segmented items={PERIODS.map((p) => ({ href: p.key === "this-month" ? "/accounts" : `/accounts?period=${p.key}`, label: p.label, title: p.label, active: period.key === p.key }))} />}
    />
  );
}
