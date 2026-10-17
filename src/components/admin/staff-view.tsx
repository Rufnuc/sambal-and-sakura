"use client";

import { useEffect, useState } from "react";
import { UserPlus, Trash2, Shield, Check, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/admin/ui";
import { fetchStaff, createStaff, updateStaff, deleteStaff, type StaffMember } from "@/lib/admin/api";
import { GRANTABLE_SECTIONS } from "@/lib/admin/sections";
import { cn } from "@/lib/utils";

export function StaffView() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [myPassword, setMyPassword] = useState(""); // the owner's own password, to confirm
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [perms, setPerms] = useState<Set<string>>(new Set(["orders", "bookings"]));
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchStaff().then((s) => { setStaff(s); setReady(true); }); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createStaff({ name, email, password, role, permissions: role === "admin" ? [] : [...perms], confirmPassword: myPassword });
    setBusy(false);
    setMyPassword("");
    if (res.ok) {
      toast.success(`${name} added`);
      setName(""); setEmail(""); setPassword(""); setRole("staff"); setPerms(new Set(["orders", "bookings"]));
      setStaff(await fetchStaff());
    } else toast.error(res.error ?? "Could not create staff.");
  }

  async function togglePerm(member: StaffMember, key: string) {
    if (member.role === "admin") return;
    const adding = !member.permissions.includes(key);
    const next = adding ? [...member.permissions, key] : member.permissions.filter((p) => p !== key);
    // Giving access needs the owner's password; taking it away doesn't.
    const confirmPassword = adding ? window.prompt(`Enter YOUR password to give ${member.name} access:`) : undefined;
    if (adding && !confirmPassword) return;
    const r = await updateStaff(member.id, { permissions: next, ...(confirmPassword ? { confirmPassword } : {}) });
    if (r.ok) setStaff(await fetchStaff()); else toast.error(r.error ?? "Could not update.");
  }
  async function remove(member: StaffMember) {
    if (!window.confirm(`Remove ${member.name}? They'll be signed out straight away.`)) return;
    const r = await deleteStaff(member.id);
    if (r.ok) { toast(`${member.name} removed`); setStaff(await fetchStaff()); }
    else toast.error(r.error ?? "Could not remove.");
  }
  async function resetPassword(member: StaffMember) {
    const newPassword = window.prompt(`New password for ${member.name} (at least 10 characters):`);
    if (!newPassword) return;
    if (newPassword.length < 10) { toast.error("Use at least 10 characters."); return; }
    const confirmPassword = window.prompt("Enter YOUR password to confirm:");
    if (!confirmPassword) return;
    const r = await updateStaff(member.id, { newPassword, confirmPassword });
    if (r.ok) toast.success(`Password changed - ${member.name} has been signed out everywhere`);
    else toast.error(r.error ?? "Could not change the password.");
  }

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Staff</h1>
        <p className="text-muted-foreground">Create staff accounts and choose what each person can access</p>
      </div>

      <SectionCard title="Add a staff member" action={<UserPlus className="size-5 text-gold-ink" />}>
        <form onSubmit={create} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><Label htmlFor="st-name">Name</Label><Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" required /></div>
            <div><Label htmlFor="st-email">Email</Label><Input id="st-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11" required /></div>
            <div><Label htmlFor="st-pass">Password</Label><Input id="st-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11" minLength={10} required placeholder="At least 10 characters" /></div>
          </div>
          <div>
            <Label>Role</Label>
            <div className="mt-1.5 flex gap-2">
              {(["staff", "admin"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} className={cn("rounded-full border px-4 py-1.5 text-sm capitalize transition", role === r ? "border-primary bg-primary/10 text-gold-ink" : "border-border hover:bg-muted")}>{r === "admin" ? "Admin (full access)" : "Staff"}</button>
              ))}
            </div>
          </div>
          {role === "staff" && (
            <div>
              <Label>Can access</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {GRANTABLE_SECTIONS.map((s) => {
                  const on = perms.has(s.key);
                  return (
                    <button key={s.key} type="button" onClick={() => setPerms((p) => { const n = new Set(p); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })}
                      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition", on ? "border-jade bg-jade/10 text-jade" : "border-border text-muted-foreground hover:bg-muted")}>
                      {on && <Check className="size-3.5" />} {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="max-w-xs">
            <Label htmlFor="st-mypass">Your password</Label>
            <Input id="st-mypass" type="password" autoComplete="current-password" value={myPassword} onChange={(e) => setMyPassword(e.target.value)} className="mt-1.5 h-11" required />
            <p className="mt-1 text-xs text-muted-foreground">To confirm it&apos;s really you before giving someone access.</p>
          </div>
          <Button type="submit" className="h-11 w-fit gap-1.5 font-semibold" disabled={busy}><UserPlus className="size-4" /> {busy ? "Adding…" : "Add staff member"}</Button>
        </form>
      </SectionCard>

      <SectionCard title="Team">
        <ul className="flex flex-col gap-3">
          {staff.map((m) => (
            <li key={m.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">{m.name} {m.role === "admin" && <Badge variant="outline" className="gap-1 border-gold/30 bg-gold/10 text-gold-ink"><Shield className="size-3" /> Admin</Badge>}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => resetPassword(m)}><KeyRound className="size-3.5" /> Reset password</Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => remove(m)}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              {m.role === "staff" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {GRANTABLE_SECTIONS.map((s) => {
                    const on = m.permissions.includes(s.key);
                    return (
                      <button key={s.key} onClick={() => togglePerm(m, s.key)}
                        className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition", on ? "border-jade bg-jade/10 text-jade" : "border-border text-muted-foreground hover:bg-muted")}>
                        {on && <Check className="size-3" />} {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
