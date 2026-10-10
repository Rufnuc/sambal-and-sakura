import { redirect } from "next/navigation";
import { staffFor } from "@/server/auth";

/**
 * For admin pages: the signed-in staff member if they may open this section, otherwise back to
 * the dashboard. (The sidebar hides sections they can't use; this stops typing the address.)
 */
export async function requireSectionPage(section: string) {
  const u = await staffFor(section);
  if (!u) redirect("/admin");
  return u;
}
