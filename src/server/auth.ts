import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import type { User } from "@prisma/client";
import { canAccess, parsePermissions } from "@/lib/admin/sections";

// In production the cookie uses the __Host- prefix: the browser then only accepts it over HTTPS,
// for this exact host, on path "/", which blocks cookie injection from other subdomains.
const PROD = process.env.NODE_ENV === "production";
const COOKIE = PROD ? "__Host-ss_session" : "ss_session";

export const CUSTOMER_SESSION_DAYS = 30;
export const STAFF_SESSION_HOURS = 12;   // staff/admin must sign in again every shift
const STAFF_IDLE_HOURS = 4;       // ...or after 4 hours without using the admin
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export const isStaffRole = (role: string) => role === "staff" || role === "admin";

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
// A real bcrypt hash (same cost) of a random string: comparing against it takes as long as a real
// check, so "unknown email" and "wrong password" can't be told apart by response time.
let dummyHash: Promise<string> | null = null;
export async function dummyVerify(pw: string): Promise<void> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), 10);
  await bcrypt.compare(pw, await dummyHash).catch(() => false);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(user: Pick<User, "id" | "role">): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const staff = isStaffRole(user.role);
  const expiresAt = new Date(Date.now() + (staff ? STAFF_SESSION_HOURS * 3600_000 : CUSTOMER_SESSION_DAYS * 86400_000));
  await prisma.session.create({ data: { token: sha256(token), userId: user.id, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: PROD, sameSite: "lax", path: "/", expires: expiresAt });
}

async function cookieToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

export async function destroySession(): Promise<void> {
  const token = await cookieToken();
  const jar = await cookies();
  if (token) await prisma.session.deleteMany({ where: { token: sha256(token) } });
  jar.delete(COOKIE);
}

/** Sign the user out everywhere except (optionally) the current browser. */
export async function destroyOtherSessions(userId: string, keepCurrent = true): Promise<void> {
  const token = keepCurrent ? await cookieToken() : undefined;
  await prisma.session.deleteMany({ where: { userId, ...(token ? { token: { not: sha256(token) } } : {}) } });
}

/** The signed-in user, or null. Enforces expiry and (for staff) the inactivity timeout. */
export async function currentUser(): Promise<User | null> {
  const token = await cookieToken();
  if (!token) return null;
  const hashed = sha256(token);
  const session = await prisma.session.findUnique({ where: { token: hashed }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  const idleExpired = isStaffRole(session.user.role) && now - session.lastSeenAt.getTime() > STAFF_IDLE_HOURS * 3600_000;
  if (session.expiresAt.getTime() < now || idleExpired || session.user.status !== "active") {
    await prisma.session.deleteMany({ where: { token: hashed } }).catch(() => {});
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.session.update({ where: { token: hashed }, data: { lastSeenAt: new Date(now) } }).catch(() => {});
  }
  return session.user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AuthError("unauthorized", 401);
  return u;
}

export async function requireStaff(): Promise<User> {
  const u = await requireUser();
  if (!isStaffRole(u.role)) throw new AuthError("forbidden", 403);
  return u;
}

/** The signed-in user if they may use this admin section (admins: everything), else null. */
export async function staffFor(section: string): Promise<User | null> {
  const u = await currentUser();
  if (!u || !isStaffRole(u.role)) return null;
  return canAccess(section, u.role, parsePermissions(u.permissions)) ? u : null;
}

/** The signed-in owner/admin, else null. */
export async function adminUser(): Promise<User | null> {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null;
}

/** Safe public shape of a user (never leak passwordHash). */
export function publicUser(u: User) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone,
    role: u.role, points: u.points, referralCode: u.referralCode,
    marketingOptIn: u.marketingOptIn, createdAt: u.createdAt,
    emailVerified: !!u.emailVerifiedAt, // marketing emails wait for this; ordering doesn't
  };
}

export function isStaff(u: Pick<User, "role">) {
  return isStaffRole(u.role);
}
