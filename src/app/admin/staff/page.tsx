import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { StaffView } from "@/components/admin/staff-view";

export default async function AdminStaffPage() {
  const u = await currentUser();
  if (u?.role !== "admin") redirect("/admin");
  return <StaffView />;
}
