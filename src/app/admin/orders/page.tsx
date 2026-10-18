import { OrdersView } from "@/components/admin/orders-view";
import { requireSectionPage } from "@/server/admin-page";

export default async function AdminOrdersPage() {
  const u = await requireSectionPage("orders");
  return <OrdersView isOwner={u.role === "admin"} />;
}
