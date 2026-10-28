"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Star, Gift, LogOut, ShoppingBag, CalendarCheck, User as UserIcon, Crown, ShieldCheck, Download, MailCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CopyCode } from "@/components/copy-code";
import { LazyAuthDialog as AuthDialog } from "@/components/account/lazy-auth-dialog";
import { useAuth, LOYALTY, tierFor } from "@/lib/store/auth";
import { OrderStatusPill } from "@/components/admin/ui";
import { gbp } from "@/lib/format";
import type { OrderStatus } from "@/lib/data/site";
import { cn } from "@/lib/utils";

interface ApiOrder { id: string; fulfilment: string; status: string; total: number; createdAt: string; lines: { qty: number }[] }
interface ApiBooking { id: string; date: string; time: string; party: number; status: string; occasion?: string | null }

const SOURCE_LABEL: Record<string, string> = {
  welcome: "welcome offer", wheel: "Fortune Wheel", loyalty: "points", referral: "for referring a friend", "referral-welcome": "from your friend's referral",
};

export default function AccountPage() {
  const { user, loaded } = useAuth();
  if (!loaded) return <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6"><h1 className="sr-only">Your account</h1><div className="h-80 animate-pulse rounded-2xl bg-muted" /></div>;
  return <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">{user ? <Dashboard /> : <SignedOut />}</div>;
}

function SignedOut() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 text-gold-ink"><UserIcon className="size-8" /></div>
      <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight">Your account</h1>
      <p className="mt-3 text-muted-foreground text-pretty">
        Sign in to earn {LOYALTY.pointsPerPound} points per £1 on completed orders, save your rewards, and track your orders and bookings.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button className="h-12 px-6 font-semibold" onClick={() => { setMode("signup"); setOpen(true); }}>Create account</Button>
        <Button variant="outline" className="h-12 px-6" onClick={() => { setMode("signin"); setOpen(true); }}>Sign in</Button>
      </div>
      <AuthDialog open={open} onOpenChange={setOpen} defaultMode={mode} />
    </div>
  );
}

function Card({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm scroll-mt-24", className)}>{children}</section>;
}

function Dashboard() {
  const { user, rewards, logout, redeemPoints, updateProfile } = useAuth();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!user) return;
    setName(user.name); setPhone(user.phone);
    fetch("/api/orders", { cache: "no-store" }).then((r) => r.json()).then((d) => setOrders(d.orders ?? [])).catch(() => {});
    fetch("/api/bookings", { cache: "no-store" }).then((r) => r.json()).then((d) => setBookings(d.bookings ?? [])).catch(() => {});
  }, [user]);

  if (!user) return null;
  const { current, next } = tierFor(user.points);
  const progress = next ? Math.min(100, ((user.points - current.min) / (next.min - current.min)) * 100) : 100;
  const activeRewards = rewards.filter((r) => r.active ?? !r.used); // the server leaves out expired ones and ended campaigns
  const canRedeem = user.points >= LOYALTY.redeemStep;

  async function redeem() {
    const res = await redeemPoints();
    if (res.ok) toast.success(`Redeemed ${LOYALTY.redeemStep} points for ${gbp(LOYALTY.redeemValue)} off!`);
    else toast.error(res.error ?? "Could not redeem.");
  }
  async function saveProfile() {
    const res = await updateProfile({ name: name.trim(), phone: phone.trim() });
    if (res.ok) { setEditing(false); toast.success("Profile updated"); }
    else toast.error(res.error ?? "Could not update.");
  }

  async function cancelBooking(id: string) {
    const res = await fetch(`/api/bookings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    if (res.ok) {
      setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
      toast.success("Booking cancelled");
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Could not cancel.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium uppercase tracking-widest text-gold-ink">My account</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">Hi, <span className="notranslate" translate="no">{user.name.split(" ")[0]}</span></h1>
        </div>
        <Button variant="outline" className="h-10 gap-2" onClick={() => logout()}><LogOut className="size-4" /> Sign out</Button>
      </div>

      {user.emailVerified === false && <ConfirmEmailBanner email={user.email} />}

      <Card className="bg-gradient-to-br from-gold/15 to-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-gold-ink"><Crown className="size-6" /></span>
            <div>
              <p className="text-sm text-muted-foreground">{current.name} member</p>
              <p className="font-display text-3xl font-bold">{user.points} <span className="text-base font-medium text-muted-foreground">points</span></p>
              {!!user.pendingPoints && <p className="text-xs text-muted-foreground">+{user.pendingPoints} pending - added when your orders are completed</p>}
            </div>
          </div>
          <Button className="h-11 gap-2" disabled={!canRedeem} onClick={redeem}>
            <Gift className="size-4" /> Redeem {LOYALTY.redeemStep} pts → {gbp(LOYALTY.redeemValue)} off
          </Button>
        </div>
        <div className="mt-5">
          <Progress value={progress} className="h-2" />
          <p className="mt-2 text-sm text-muted-foreground">
            {next ? <>{next.min - user.points} points to <span className="font-medium text-foreground">{next.name}</span></> : <>You've reached the top tier - {current.name}!</>}
            {" · "}Earn {LOYALTY.pointsPerPound} pts per £1 on completed orders.
          </p>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card id="rewards">
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><Gift className="size-5 text-sambal" /> Rewards wallet</h2>
          {activeRewards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active rewards yet. Spin the <Link href="/offers?tab=wheel" className="font-medium text-gold-ink hover:underline">Fortune Wheel</Link> or redeem points.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {activeRewards.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">Expires {new Date(r.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {SOURCE_LABEL[r.source] ?? r.source}</p>
                  </div>
                  <CopyCode code={r.code} />
                </li>
              ))}
            </ul>
          )}
          {rewards.some((r) => r.used) && <p className="mt-3 text-xs text-muted-foreground">{rewards.filter((r) => r.used).length} reward(s) used.</p>}
          <p className="mt-3 text-sm"><Link href="/offers?tab=refer" className="font-medium text-gold-ink hover:underline">Refer a friend</Link> <span className="text-muted-foreground">- you both get money off.</span></p>
        </Card>

        <SecurityCard onSignOutEverywhere={() => logout(true)} />
      </div>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><ShoppingBag className="size-5 text-gold-ink" /> Order history</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet. <Link href="/menu" className="font-medium text-gold-ink hover:underline">Start an order →</Link></p>
        ) : (
          <ul className="divide-y divide-border">
            {orders.slice(0, 8).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium"><span className="notranslate" translate="no">{o.id}</span> · <span className="capitalize">{o.fulfilment}</span></p>
                  <p className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {o.lines.reduce((n, l) => n + l.qty, 0)} items</p>
                </div>
                <div className="flex items-center gap-3">
                  <OrderStatusPill status={o.status as OrderStatus} />
                  <span className="w-16 text-right font-semibold">{gbp(o.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><CalendarCheck className="size-5 text-gold-ink" /> Your bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings yet. <Link href="/book" className="font-medium text-gold-ink hover:underline">Book a table →</Link></p>
        ) : (
          <ul className="divide-y divide-border">
            {bookings.slice(0, 6).map((b) => {
              const cancellable = ["upcoming", "waitlist", "delayed"].includes(b.status);
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{new Date(b.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {b.time}</p>
                    <p className="text-xs text-muted-foreground">{b.party} guests{b.occasion ? ` · ${b.occasion}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{b.status}</Badge>
                    {cancellable && <Button variant="ghost" className="h-8 px-2 text-xs text-sambal hover:text-sambal" onClick={() => cancelBooking(b.id)}>Cancel</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><UserIcon className="size-5 text-gold-ink" /> Profile</h2>
          {!editing && <Button variant="ghost" className="h-9" onClick={() => setEditing(true)}>Edit</Button>}
        </div>
        {editing ? (
          <div className="flex flex-col gap-3">
            <div><Label htmlFor="pf-name">Name</Label><Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" /></div>
            <div><Label htmlFor="pf-phone">Phone</Label><Input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 h-11" inputMode="tel" /></div>
            <div className="flex gap-2">
              <Button className="h-10" onClick={saveProfile}>Save</Button>
              <Button variant="outline" className="h-10" onClick={() => { setEditing(false); setName(user.name); setPhone(user.phone); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Name</dt><dd className="font-medium notranslate" translate="no">{user.name}</dd></div>
            <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium notranslate" translate="no">{user.email}</dd></div>
            <div><dt className="text-muted-foreground">Phone</dt><dd className="font-medium notranslate" translate="no">{user.phone}</dd></div>
          </dl>
        )}
        <Separator className="my-4" />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Star className="size-3.5 text-gold-ink" /> Member since {new Date(user.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
      </Card>
    </div>
  );
}

/** Offers, password, data download, sign out everywhere, deactivate and close (UK GDPR rights). */
function SecurityCard({ onSignOutEverywhere }: { onSignOutEverywhere: () => void }) {
  const { user, updateProfile, refresh } = useAuth();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [panel, setPanel] = useState<"none" | "deactivate" | "close">("none");
  const [confirmPw, setConfirmPw] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { toast.success("Password changed. Other devices have been signed out."); setPw({ current: "", next: "" }); }
    else toast.error(d.error ?? "Could not change password.");
  }
  async function toggleOffers() {
    const next = !user?.marketingOptIn;
    const r = await updateProfile({ marketingOptIn: next });
    if (r.ok) toast.success(next ? "You'll get our offers by email." : "You won't get offer emails any more.");
    else toast.error(r.error ?? "Could not update.");
  }
  async function deactivate() {
    setBusy(true);
    const res = await fetch("/api/account/deactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: confirmPw }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(d.error ?? "Could not deactivate."); return; }
    toast.success(`Account deactivated. Sign in before ${new Date(d.reactivateBy).toLocaleDateString("en-GB", { day: "numeric", month: "long" })} to reactivate it.`);
    await refresh();
  }
  async function closeForGood() {
    setBusy(true);
    const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: confirmPw }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.error(d.error ?? "Could not close the account."); return; }
    toast.success("Your account has been closed.");
    await refresh();
  }

  return (
    <Card>
      <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><ShieldCheck className="size-5 text-jade" /> Privacy &amp; security</h2>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium">Offers by email</p>
          <p className="text-xs text-muted-foreground">Order and booking emails are always sent.{user?.marketingOptIn && user.emailVerified === false ? " Offers start once you confirm your email." : ""}</p>
        </div>
        <button onClick={toggleOffers} role="switch" aria-checked={!!user?.marketingOptIn} aria-label="Offers by email" className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition", user?.marketingOptIn ? "bg-jade" : "bg-muted")}>
          <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", user?.marketingOptIn ? "translate-x-6" : "translate-x-1")} />
        </button>
      </div>

      <form onSubmit={changePassword} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div><Label htmlFor="sc-cur" className="text-xs">Current password</Label><Input id="sc-cur" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="mt-1 h-10" autoComplete="current-password" required /></div>
        <div><Label htmlFor="sc-new" className="text-xs">New password (8+)</Label><Input id="sc-new" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="mt-1 h-10" minLength={8} autoComplete="new-password" required /></div>
        <Button type="submit" variant="outline" className="h-10">Change</Button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-9 gap-1.5"><a href="/api/account?export=1&format=pdf"><Download className="size-4" /> Download my data (PDF)</a></Button>
        <a href="/api/account?export=1" className="self-center text-xs text-muted-foreground underline" title="The same information as a data file, for moving it to another service">or as a data file</a>
        <Button variant="outline" className="h-9 gap-1.5" onClick={onSignOutEverywhere}><LogOut className="size-4" /> Sign out everywhere</Button>
        <Button variant="ghost" className="h-9" onClick={() => { setPanel(panel === "deactivate" ? "none" : "deactivate"); setConfirmPw(""); }}>Deactivate account</Button>
        <Button variant="ghost" className="h-9 text-sambal hover:text-sambal" onClick={() => { setPanel(panel === "close" ? "none" : "close"); setConfirmPw(""); setTyped(""); }}>Close account</Button>
      </div>

      {panel === "deactivate" && (
        <div className="mt-3 rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm">
          <p>Your account is hidden and you&apos;re signed out. Your points and rewards are kept for <b>14 days</b>: sign in and choose &quot;Reactivate&quot; to get everything back. After 14 days it&apos;s closed for good and this email can&apos;t be used for a new account.</p>
          <div className="mt-2 flex gap-2">
            <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Your password" className="h-10" autoComplete="current-password" />
            <Button className="h-10" disabled={!confirmPw || busy} onClick={deactivate}>Deactivate</Button>
          </div>
        </div>
      )}
      {panel === "close" && (
        <div className="mt-3 rounded-lg border border-sambal/30 bg-sambal/5 p-3 text-sm">
          <p><b>This can&apos;t be undone.</b> Your points and rewards are lost, your personal details are removed, and this email address can never be used to create a new account. Past orders stay in the restaurant&apos;s records without your name or contact details.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder='Type "CLOSE" to confirm' className="h-10" />
            <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Your password" className="h-10" autoComplete="current-password" />
            <Button variant="destructive" className="h-10" disabled={!confirmPw || typed.trim().toUpperCase() !== "CLOSE" || busy} onClick={closeForGood}>Close for good</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Shown until they click the link in the sign-up email. Ordering works either way. */
function ConfirmEmailBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true);
    const res = await fetch("/api/auth/verify/resend", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) toast.success(d.already ? "Your email is already confirmed." : `We've sent a new link to ${email}.`);
    else toast.error(d.error ?? "Could not send the link.");
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
      <p className="flex items-start gap-2"><MailCheck className="mt-0.5 size-4 shrink-0 text-gold-ink" /> <span>Please confirm your email: tap the link we sent to <span className="font-medium notranslate" translate="no">{email}</span>. You can order as normal in the meantime.</span></p>
      <Button size="sm" variant="outline" className="h-9" disabled={busy} onClick={resend}>Send the link again</Button>
    </div>
  );
}
