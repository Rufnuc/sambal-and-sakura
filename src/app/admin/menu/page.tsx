import { MenuView } from "@/components/admin/menu-view";
import { requireSectionPage } from "@/server/admin-page";

export default async function AdminMenuPage() {
  await requireSectionPage("menu");
  return <MenuView />;
}
