import { NextResponse } from "next/server";
import { currentUser, isStaffRole, adminUser } from "@/server/auth";
import { canAccess, parsePermissions } from "@/lib/admin/sections";
import { getFloorTables, setFloorTables } from "@/server/config";
import { floorTablesSchema, firstIssue } from "@/server/config-schema";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";
import { clientIp } from "@/server/rate-limit";
import type { Table } from "@/lib/data/tables";

// The restaurant's tables and their positions on the floor plan.
// GET: staff who can see Bookings or Floor plan (to seat guests). PUT: the owner only (changes capacity).
export async function GET() {
  const u = await currentUser();
  const perms = u ? parsePermissions(u.permissions) : [];
  if (!u || !isStaffRole(u.role) || !(canAccess("bookings", u.role, perms) || canAccess("floor", u.role, perms))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ tables: await getFloorTables(), canEdit: u.role === "admin" });
}

export async function PUT(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "Only the owner can change the floor plan." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const r = floorTablesSchema.safeParse(body?.tables);
  if (!r.success) return NextResponse.json({ error: firstIssue(r.error, "Floor plan") }, { status: 400 });
  const tables = await setFloorTables(r.data as Table[]);
  await audit({ actor: actorOf(u), action: "floor.save", entity: "config", detail: { tables: tables.length, seats: tables.reduce((n, t) => n + t.seats, 0) }, ip: clientIp(req) });
  return NextResponse.json({ tables, canEdit: true });
}
