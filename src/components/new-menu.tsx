"use client";

import { Building2, FileMinus, FilePlus2, HandCoins, Plus, ReceiptText, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const SALES = [
  { href: "/accounts/invoices/new", label: "Invoice", icon: ReceiptText },
  { href: "/accounts/quotes/new", label: "Quote", icon: FilePlus2 },
  { href: "/accounts/credit-notes/new", label: "Credit note (sales return)", icon: FileMinus },
  { href: "/accounts/payments/new", label: "Receipt (money in)", icon: Wallet },
  { href: "/accounts/customers?new=1", label: "Customer", icon: Building2 },
];
const PURCHASES = [
  { href: "/accounts/bills/new", label: "Bill", icon: ReceiptText },
  { href: "/accounts/expenses?new=1", label: "Expense", icon: HandCoins },
  { href: "/accounts/debit-notes/new", label: "Debit note (return to supplier)", icon: FileMinus },
  { href: "/accounts/payments-made/new", label: "Voucher (money out)", icon: Wallet },
  { href: "/accounts/suppliers?new=1", label: "Supplier", icon: Truck },
];

/** The Accounts create menu in the header: anything can be started from any page, without a lead or deal. */
export function NewMenu() {
  const items = (list: typeof SALES) =>
    list.map((i) => (
      <DropdownMenuItem key={i.href} render={<Link href={i.href} />}>
        <i.icon /> {i.label}
      </DropdownMenuItem>
    ));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" aria-label="New" title="Make something new" className="max-md:size-9 max-md:px-0" />}>
        <Plus />
        <span className="max-md:hidden">New</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sales</DropdownMenuLabel>
          {items(SALES)}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Purchases</DropdownMenuLabel>
          {items(PURCHASES)}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
