import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { CareersView } from "@/components/admin/careers-view";

export default async function AdminCareersPage() {
  const u = await currentUser();
  if (u?.role !== "admin") redirect("/admin");
  return <CareersView />;
}
