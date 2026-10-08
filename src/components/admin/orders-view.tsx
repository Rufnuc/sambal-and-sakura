"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Check, X, Clock, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard, OrderStatusPill } from "@/components/admin/ui";
import { fetchOrders, patchOrderStatus } from "@/lib/admin/api";
import { type PlacedOrder } from "@/lib/order";
import { type OrderStatus } from "@/lib/data/site";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

const FILTERS: { id: OrderStatus | "all" | "active"; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "all", label: "All" },
  { id: "received", label: "Received" },
  { id: "preparing", label: "Preparing" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function nextStatus(o: PlacedOrder): OrderStatus | null {
  switch (o.status) {
    case "received": return "preparing";
    case "preparing": return o.fulfilment === "delivery" ? "out-for-delivery" : "ready-for-collection";
    case "out-for-delivery": return "completed";
    case "ready-for-collection": return "completed";
    default: return null;
  }
}

export function OrdersView() {
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");
  const [detail, setDetail] = useState<PlacedOrder | null>(null);

  useEffect(() => { fetchOrders().then((o) => { setOrders(o); setReady(true); }); }, []);

  const rows = useMemo(() => {
    const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    if (filter === "all") return sorted;
    if (filter === "active") return sorted.filter((o) => !["completed", "cancelled"].includes(o.status));
    return sorted.filter((o) => o.status === filter);
  }, [orders, filter]);

  async function advance(o: PlacedOrder) {
    const ns = nextStatus(o);
    if (!ns) return;
    const updated = await patchOrderStatus(o.id, ns);
    if (updated) { setOrders((list) => list.map((x) => (x.id === o.id ? updated : x))); toast.success(`${o.id} → ${ns.replace(/-/g, " ")}`); }
    else toast.error("Could not update order.");
  }
  async function cancel(o: PlacedOrder) {
    const updated = await patchOrderStatus(o.id, "cancelled");
    if (updated) { setOrders((list) => list.map((x) => (x.id === o.id ? updated : x))); toast(`${o.id} cancelled`); }
  }

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const activeCount = orders.filter((o) => !["completed", "cancelled"].includes(o.status)).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">{activeCount} active · {orders.length} total</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition", filter === f.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>
            {f.label}
          </button>
        ))}
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const ns = nextStatus(o);
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => setDetail(o)}>
                    <TableCell className="font-medium">{o.id}<span className="block text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></TableCell>
                    <TableCell>{o.customer.name}</TableCell>
                    <TableCell className="hidden capitalize sm:table-cell">{o.fulfilment}</TableCell>
                    <TableCell className="hidden md:table-cell">{o.lines.reduce((n, l) => n + l.qty, 0)}</TableCell>
                    <TableCell className="font-semibold">{gbp(o.total)}</TableCell>
                    <TableCell>
                      <OrderStatusPill status={o.status} />
                      {o.paymentMethod === "wechat" && (
                        <span className={cn("mt-1 block text-[11px] font-semibold", o.paymentStatus === "paid" ? "text-jade" : "text-sambal")}>
                          WeChat · {o.paymentStatus === "paid" ? "PAID" : "awaiting payment"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {ns ? (
                          <Button size="sm" className="h-8 gap-1" onClick={() => advance(o)}>
                            {ns === "completed" ? <Check className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                            <span className="hidden sm:inline capitalize">{ns.replace(/-/g, " ")}</span>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                        {!["completed", "cancelled"].includes(o.status) && (
                          <Button size="icon-sm" variant="ghost" aria-label="Cancel order" onClick={() => cancel(o)}><X className="size-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No orders in this view.</p>}
        </div>
      </SectionCard>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between font-display">
                  {detail.id} <OrderStatusPill status={detail.status} />
                </DialogTitle>
              </DialogHeader>
              <Button
                variant="outline"
                className="h-9 w-fit gap-1.5"
                onClick={() => window.open(`/print/order/${detail.id}`, "_blank", "width=380,height=720")}
              >
                <Printer className="size-4" /> Print ticket
              </Button>
              <div className="text-sm">
                <p className="font-medium">{detail.customer.name} · {detail.customer.phone}</p>
                <p className="capitalize text-muted-foreground">{detail.fulfilment}{detail.customer.address ? ` · ${detail.customer.address}` : ""}{detail.customer.postcode ? ` (${detail.customer.postcode})` : ""}</p>
                {detail.customer.notes && <p className="mt-1 flex items-center gap-1.5 text-muted-foreground"><Clock className="size-3.5" /> {detail.customer.notes}</p>}
                <ul className="mt-4 divide-y divide-border border-y border-border">
                  {detail.lines.map((l) => (
                    <li key={l.lineId} className="flex justify-between py-2">
                      <span>{l.qty}× {l.name}{l.modifiers.length ? <span className="text-muted-foreground"> · {l.modifiers.map((m) => m.label).join(", ")}</span> : null}</span>
                      <span className="font-medium">{gbp(l.unitPrice * l.qty)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 space-y-1">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{gbp(detail.subtotal)}</dd></div>
                  {detail.deliveryFee > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{gbp(detail.deliveryFee)}</dd></div>}
                  {detail.discount > 0 && <div className="flex justify-between text-jade"><dt>Discount</dt><dd>− {gbp(detail.discount)}</dd></div>}
                  <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>{detail.paymentMethod === "wechat" ? `Total (WeChat · ${detail.paymentStatus === "paid" ? "PAID" : "awaiting payment"})` : "Total (cash)"}</dt><dd className="font-display text-lg">{gbp(detail.total)}</dd></div>
                </dl>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
