import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { currentUser, isStaff } from "@/server/auth";
import { ADMIN_SECTIONS, canAccess, parsePermissions } from "@/lib/admin/sections";

export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
  // Installable staff app (opens on Orders). See src/app/admin/app.webmanifest/route.ts.
  manifest: "/admin/app.webmanifest",
  appleWebApp: { capable: true, title: "S&S Orders", statusBarStyle: "black-translucent" },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user || !isStaff(user)) redirect("/staff/login");

  const perms = parsePermissions(user.permissions);
  const sections = ADMIN_SECTIONS
    .filter((s) => canAccess(s.key, user.role, perms))
    .map((s) => ({ key: s.key, label: s.label, href: s.href }));

  return (
    <AdminShell userName={user.name} role={user.role} sections={sections}>
      {children}
    </AdminShell>
  );
}
