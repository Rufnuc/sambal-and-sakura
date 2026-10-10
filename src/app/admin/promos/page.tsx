import { PromosView } from "@/components/admin/promos-view";
import { requireSectionPage } from "@/server/admin-page";

export default async function AdminPromosPage() {
  await requireSectionPage("promos");
  return <PromosView />;
}
