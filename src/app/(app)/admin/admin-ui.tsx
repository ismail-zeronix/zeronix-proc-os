"use client";

import { CheckCircle2, KeyRound, LayoutGrid, UserPlus, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { allowedApps, GRANTABLE_APPS } from "@/lib/apps";
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
  /** null = the role's default apps */
  apps: string[] | null;
}

/** Which apps one user can open: the role's defaults, or a list the admin picks. Admins always see every app. */
function UserApps({ user, disabled, run }: { user: UserRow; disabled: boolean; run: ReturnType<typeof useAction>[1] }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(user.apps !== null);
  const [picked, setPicked] = useState<string[]>(user.apps ?? allowedApps({ role: user.role }));
  if (user.role === "admin") return <span className="text-sm text-muted-foreground">All apps</span>;
  const count = user.apps === null ? "Role defaults" : `${user.apps.length} app${user.apps.length === 1 ? "" : "s"}`;
  const toggle = (key: string, on: boolean) => setPicked(on ? [...picked, key] : picked.filter((k) => k !== key));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" disabled={disabled} />}>
        <LayoutGrid /> {count}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={!custom} onCheckedChange={(v) => setCustom(!v)} /> Use role defaults
        </label>
        <div className="grid gap-1.5 border-t pt-2">
          {GRANTABLE_APPS.map((a) => (
            <label key={a.key} className="flex items-center gap-2 text-sm aria-disabled:opacity-50" aria-disabled={!custom}>
              <Checkbox
                disabled={!custom}
                checked={custom ? picked.includes(a.key) : allowedApps({ role: user.role }).includes(a.key)}
                onCheckedChange={(v) => toggle(a.key, !!v)}
              />
              {a.label}
              {a.status === "soon" && <span className="text-xs text-muted-foreground">(coming soon)</span>}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => {
            run(() => updateUser(user.id, { apps: custom ? picked : null }), "Apps saved");
            setOpen(false);
          }}
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function AdminUsers({ users, meId }: { users: UserRow[]; meId: number }) {
  const [pending, run] = useAction();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "sales" as "admin" | "sales" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Admins see every app and manage users and settings. For sales users, pick which apps they can open.
        </CardDescription>
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
              <TableHead>Apps</TableHead>
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
                  <UserApps key={`${u.id}-${u.role}-${u.apps?.join(",") ?? "-"}`} user={u} disabled={pending} run={run} />
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
