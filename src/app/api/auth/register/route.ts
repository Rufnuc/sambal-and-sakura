import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { hashPassword, createSession, referralCode, publicUser } from "@/server/auth";
import { registerSchema } from "@/server/validation";

const MAX_ACCOUNTS_PER_IP_24H = 3;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  return ip;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });

  const { name, email, phone, password } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "An account with that email already exists - sign in instead." }, { status: 409 });
  }

  // Limit duplicate accounts from the same network (skips local/unknown IPs).
  const ip = clientIp(req);
  const localhost = !ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.");
  const ipKey = localhost ? null : "ipreg:" + Buffer.from(ip).toString("base64").slice(0, 24);
  if (ipKey) {
    const row = await prisma.setting.findUnique({ where: { key: ipKey } });
    const now = Date.now();
    const recent: number[] = (row ? JSON.parse(row.value) : []).filter((t: number) => now - t < 86400000);
    if (recent.length >= MAX_ACCOUNTS_PER_IP_24H) {
      return NextResponse.json({ error: "Too many accounts created from this network recently. Please contact us." }, { status: 429 });
    }
  }

  const expiresAt = new Date(Date.now() + 30 * 86400000);
  const user = await prisma.user.create({
    data: {
      name, email, phone,
      passwordHash: await hashPassword(password),
      referralCode: referralCode(name),
      points: 50,
      rewards: {
        create: {
          label: "10% off your next order",
          code: "WELC" + Math.random().toString(36).slice(2, 6).toUpperCase(),
          kind: "percent", amount: 10, source: "welcome", expiresAt,
        },
      },
    },
  });

  if (ipKey) {
    const now = Date.now();
    const row = await prisma.setting.findUnique({ where: { key: ipKey } });
    const recent: number[] = (row ? JSON.parse(row.value) : []).filter((t: number) => now - t < 86400000);
    recent.push(now);
    await prisma.setting.upsert({ where: { key: ipKey }, update: { value: JSON.stringify(recent) }, create: { key: ipKey, value: JSON.stringify(recent) } });
  }

  await createSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}
