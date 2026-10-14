"use client";

import { useState } from "react";
import { Activity, Wifi, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/ui";
import { fetchDiagnostics, fetchAudit, type Diagnostics, type AuditEntry } from "@/lib/admin/api";

const ACTION_LABEL: Record<string, string> = {
  "order.status": "Order status changed",
  "order.reprint": "Ticket reprinted",
  "order.paid": "Order paid (WeChat)",
  "booking.update": "Booking edited",
  "menu.sold_out": "Dish availability",
  "orders.pause": "Online orders paused",
  "orders.resume": "Online orders resumed",
  "config.save": "Settings saved",
  "settings.save": "Dates / zones saved",
  "staff.create": "Staff added",
  "staff.update": "Staff changed",
  "staff.delete": "Staff removed",
  "staff.password_change": "Password changed",
  "login.success": "Staff signed in",
  "login.failed": "Failed sign-in",
  "login.rate_limited": "Sign-in blocked (too many tries)",
  "campaign.create": "Offer email sent",
  "campaign.cancel": "Offer email stopped",
  "email.unblock": "Closed account's email unblocked",
  "cancellations.reset": "Customer's cancellations reset",
  "settings.cancel_policy": "Cancellation rules changed",
};

/** Owner-only: "Connection check" (is the rate limiter seeing real visitor IPs?) and the activity log. */
export function OwnerTools() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [busy, setBusy] = useState<"diag" | "logs" | null>(null);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <SectionCard title="Connection check" action={<Wifi className="size-5 text-jade" />}>
        <p className="text-sm text-muted-foreground">
          Confirms the site sees each visitor&apos;s real address (it&apos;s what limits fake orders and sign-ups).
          Open this on your phone using mobile data, then on Wi-Fi: the detected address should change.
        </p>
        <Button variant="outline" className="mt-3 h-9 gap-1.5" disabled={busy === "diag"} onClick={async () => { setBusy("diag"); setDiag(await fetchDiagnostics()); setBusy(null); }}>
          {busy === "diag" && <Loader2 className="size-4 animate-spin" />} Run check
        </Button>
        {diag && (
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Detected address</dt><dd className="font-mono">{diag.detectedIp}</dd></div>
            {Object.entries(diag.headers).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="truncate font-mono">{v ?? "-"}</dd></div>
            ))}
            <div className="mt-2 border-t border-border pt-2 font-medium">Switched on</div>
            {Object.entries(diag.integrations).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className={v ? "text-jade" : "text-sambal"}>{v === true ? "yes" : v === false || v === null ? "no" : String(v)}</dd></div>
            ))}
            {diag.database && (() => {
              const off = diag.database.rowLevelSecurityOff;
              const ok = Array.isArray(off) && off.length === 0;
              return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">database row security</dt><dd className={ok || typeof off === "string" && off.startsWith("n/a") ? "text-jade" : "text-sambal"}>{Array.isArray(off) ? (ok ? "on for every table" : `OFF: ${off.join(", ")}`) : off}</dd></div>;
            })()}
          </dl>
        )}
      </SectionCard>

      <SectionCard title="Activity log" action={<Activity className="size-5 text-gold-ink" />}>
        <p className="text-sm text-muted-foreground">Who changed what: order statuses, edits, sign-ins and settings (last 200).</p>
        <Button variant="outline" className="mt-3 h-9 gap-1.5" disabled={busy === "logs"} onClick={async () => { setBusy("logs"); setLogs(await fetchAudit()); setBusy(null); }}>
          {busy === "logs" && <Loader2 className="size-4 animate-spin" />} Show activity
        </Button>
        {logs && (
          <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto text-xs">
            {logs.length === 0 && <li className="py-2 text-muted-foreground">Nothing yet.</li>}
            {logs.map((l) => (
              <li key={l.id} className="py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{ACTION_LABEL[l.action] ?? l.action}{l.entityId ? ` · ${l.entityId}` : ""}</span>
                  <span className="shrink-0 text-muted-foreground">{new Date(l.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="text-muted-foreground">{l.actorEmail ?? "system / customer"}{l.detail ? ` · ${l.detail.slice(0, 140)}` : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
