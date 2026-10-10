import { FloorView } from "@/components/admin/floor-view";
import { requireSectionPage } from "@/server/admin-page";

export default async function AdminFloorPage() {
  await requireSectionPage("floor");
  return <FloorView />;
}
