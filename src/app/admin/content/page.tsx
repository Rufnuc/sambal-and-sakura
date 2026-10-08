import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { ContentView } from "@/components/admin/content-view";

export default async function AdminContentPage() {
  const u = await currentUser();
  if (u?.role !== "admin") redirect("/admin");
  return <ContentView />;
}
