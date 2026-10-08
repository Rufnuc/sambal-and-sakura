import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import type { User } from "@prisma/client";

const COOKIE = "ss_session";
const SESSION_DAYS = 30;

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function referralCode(name: string): string {
  const base = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4) || "SAKURA";
  return `${base}${Math.floor(100 + Math.random() * 900)}`;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    jar.delete(COOKIE);
  }
}

/** The signed-in user, or null. Also clears expired sessions it encounters. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AuthError("unauthorized", 401);
  return u;
}

export async function requireStaff(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "staff" && u.role !== "admin") throw new AuthError("forbidden", 403);
  return u;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Safe public shape of a user (never leak passwordHash). */
export function publicUser(u: User) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone,
    role: u.role, points: u.points, referralCode: u.referralCode,
    createdAt: u.createdAt,
  };
}

export function isStaff(u: Pick<User, "role">) {
  return u.role === "staff" || u.role === "admin";
}
