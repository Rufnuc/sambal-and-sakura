import { OrdersView } from "@/components/admin/orders-view";
import { requireSectionPage } from "@/server/admin-page";

export default async function AdminOrdersPage() {
  await requireSectionPage("orders");
  return <OrdersView />;
}
