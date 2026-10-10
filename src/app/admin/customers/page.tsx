import { CustomersView } from "@/components/admin/customers-view";
import { requireSectionPage } from "@/server/admin-page";

export default async function AdminCustomersPage() {
  await requireSectionPage("customers");
  return <CustomersView />;
}
