"use client";

import { CheckCircle2, KeyRound, UserPlus, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createUser, saveSettings, updateUser } from "./actions";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  return [pending, run] as const;
}

export function AdminSettings({
  settings,
  models,
  health,
}: {
  settings: { llm_model: string; stale_days: string; fx_usd: string };
  models: string[];
  health: { ok: boolean; detail: string };
}) {
  const [model, setModel] = useState(settings.llm_model);
  const [stale, setStale] = useState(settings.stale_days);
  const [fx, setFx] = useState(settings.fx_usd);
  const [pending, run] = useAction();
  const options = models.includes(model) ? models : [model, ...models];

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI & comparison</CardTitle>
        <CardDescription className="flex items-center gap-2">
          {health.ok ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <XCircle className="size-4 text-destructive" />
          )}
          {health.detail}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_200px_200px_auto] md:items-start">
        <div className="grid gap-1.5">
          <Label>Local model (Ollama)</Label>
          <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
            {options.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            qwen3.5:4b gives the best accuracy on CPU (~3.4 GB RAM). qwen3.5:2b is ~20% faster but less accurate.
            Pull other models with <code>ollama pull &lt;name&gt;</code>.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label>Offer is “old” after (days)</Label>
          <Input type="number" min={1} max={365} value={stale} onChange={(e) => setStale(e.target.value)} />
          <p className="text-xs text-muted-foreground">Old offers are greyed and never win “best price”.</p>
        </div>
        <div className="grid gap-1.5">
          <Label>USD to AED rate</Label>
          <Input type="number" min={1} max={10} step={0.0001} value={fx} onChange={(e) => setFx(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Lets USD distributor prices rank against AED prices. Other currencies are only compared with themselves.
          </p>
        </div>
        <Button
          className="md:mt-[1.375rem]"
          disabled={pending}
          onClick={() =>
            run(() => saveSettings({ llm_model: model, stale_days: Number(stale), fx_usd: Number(fx) }), "Settings saved")
          }
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: "admin" | "sales";
  isActive: boolean;
}

export function AdminUsers({ users, meId }: { users: UserRow[]; meId: number }) {
  const [pending, run] = useAction();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "sales" as "admin" | "sales" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Sales users can paste, review and compare. Admins also manage users and settings.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_140px_auto] md:items-end">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="min 8 characters"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <NativeSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "sales" })}>
              <NativeSelectOption value="sales">Sales</NativeSelectOption>
              <NativeSelectOption value="admin">Admin</NativeSelectOption>
            </NativeSelect>
          </div>
          <Button
            disabled={pending || !form.name || !form.email || form.password.length < 8}
            onClick={() =>
              run(async () => {
                await createUser(form);
                setForm({ name: "", email: "", password: "", role: "sales" });
              }, "User created")
            }
          >
            <UserPlus /> Add
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.name} {u.id === meId && <Badge variant="outline">you</Badge>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <NativeSelect
                    size="sm"
                    value={u.role}
                    disabled={u.id === meId || pending}
                    onChange={(e) => run(() => updateUser(u.id, { role: e.target.value as "admin" | "sales" }), "Role updated")}
                  >
                    <NativeSelectOption value="sales">Sales</NativeSelectOption>
                    <NativeSelectOption value="admin">Admin</NativeSelectOption>
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "secondary" : "outline"}>{u.isActive ? "Active" : "Disabled"}</Badge>
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const pw = prompt(`New password for ${u.name} (min 8 characters)`);
                      if (pw) run(() => updateUser(u.id, { password: pw }), "Password changed");
                    }}
                  >
                    <KeyRound /> Reset password
                  </Button>
                  {u.id !== meId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => updateUser(u.id, { isActive: !u.isActive }), u.isActive ? "User disabled" : "User enabled")}
                    >
                      {u.isActive ? "Disable" : "Enable"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
