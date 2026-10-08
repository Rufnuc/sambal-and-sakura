import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/data/site";
import type { BookingStatus } from "@/lib/booking";

export function StatCard({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent?: "gold" | "jade" | "sambal" | "sakura" }) {
  const ring = accent === "jade" ? "text-jade" : accent === "sambal" ? "text-sambal" : accent === "sakura" ? "text-sakura" : "text-gold";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold", ring)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SectionCard({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-lg font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  received: "bg-gold/15 text-gold border-gold/30",
  preparing: "bg-sakura/15 text-sambal border-sakura/30",
  "out-for-delivery": "bg-jade/15 text-jade border-jade/30",
  "ready-for-collection": "bg-jade/15 text-jade border-jade/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-sambal/10 text-sambal border-sambal/30",
};

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Received",
  preparing: "Preparing",
  "out-for-delivery": "Out for delivery",
  "ready-for-collection": "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", ORDER_STATUS_STYLE[status])}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

const BOOKING_STATUS_STYLE: Record<BookingStatus, string> = {
  upcoming: "bg-gold/15 text-gold border-gold/30",
  seated: "bg-jade/15 text-jade border-jade/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-sambal/10 text-sambal border-sambal/30",
  "no-show": "bg-sambal/15 text-sambal border-sambal/30",
  delayed: "bg-sakura/15 text-sambal border-sakura/30",
  waitlist: "bg-sakura/15 text-sambal border-sakura/30",
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const label = status === "no-show" ? "No-show" : status[0].toUpperCase() + status.slice(1);
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", BOOKING_STATUS_STYLE[status])}>
      {label}
    </span>
  );
}
