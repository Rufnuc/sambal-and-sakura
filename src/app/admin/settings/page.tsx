import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { SettingsView } from "@/components/admin/settings-view";

export default async function AdminSettingsPage() {
  const u = await currentUser();
  if (u?.role !== "admin") redirect("/admin");
  return <SettingsView />;
}
