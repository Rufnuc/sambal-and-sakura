// Admin sections — shared by the sidebar nav, staff permissions UI, and gating.

export interface AdminSection { key: string; label: string; href: string; adminOnly?: boolean }

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin" },
  { key: "orders", label: "Orders", href: "/admin/orders" },
  { key: "bookings", label: "Bookings", href: "/admin/bookings" },
  { key: "floor", label: "Floor plan", href: "/admin/floor" },
  { key: "customers", label: "Customers", href: "/admin/customers" },
  { key: "menu", label: "Menu", href: "/admin/menu" },
  { key: "promos", label: "Promotions", href: "/admin/promos", adminOnly: true }, // prices & offers: owner only
  { key: "content", label: "Site content", href: "/admin/content", adminOnly: true },
  { key: "careers", label: "Careers", href: "/admin/careers", adminOnly: true },
  { key: "analytics", label: "Analytics", href: "/admin/analytics" },
  { key: "staff", label: "Staff", href: "/admin/staff", adminOnly: true },
  { key: "settings", label: "Settings", href: "/admin/settings", adminOnly: true },
];

// Sections a staff member can be granted (admins always have everything).
export const GRANTABLE_SECTIONS = ADMIN_SECTIONS.filter((s) => !s.adminOnly && s.key !== "dashboard");

export function canAccess(section: string, role: string, permissions: string[]): boolean {
  if (role === "admin") return true;
  if (role !== "staff") return false;
  const meta = ADMIN_SECTIONS.find((s) => s.key === section);
  if (meta?.adminOnly) return false;
  if (section === "dashboard") return true;
  return permissions.includes(section);
}

export function parsePermissions(json: string | null | undefined): string[] {
  if (!json) return [];
  try { const a = JSON.parse(json); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}
