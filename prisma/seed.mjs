// Seed the dev database. Run: node --env-file=.env prisma/seed.mjs
// DESTRUCTIVE: deletes all orders, bookings, rewards, sessions and customers, and creates demo
// logins with known passwords. It therefore refuses to run against anything but a local SQLite
// file, so it can never wipe or open up the live restaurant database.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:") || process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: DATABASE_URL is not a local SQLite file (this script deletes data and creates demo passwords).");
  process.exit(1);
}

const prisma = new PrismaClient();

const SAMPLE = [
  { id: "mixed-platter", name: "Mixed Platter", price: 12.0 },
  { id: "crispy-shredded-chicken", name: "Crispy Shredded Chicken", price: 6.9 },
  { id: "duck-quarter", name: "Aromatic Crispy Duck (Quarter)", price: 9.5 },
  { id: "chicken-katsu-don", name: "Chicken Katsu Curry Don", price: 10.8 },
  { id: "house-rice", name: "House Rice", price: 7.9 },
  { id: "chow-mein", name: "Chow Mein", price: 7.5 },
  { id: "sp-king-prawns", name: "Salt & Pepper King Prawns", price: 7.8 },
  { id: "boba-tea", name: "Signature Brown Sugar Boba Tea", price: 4.5 },
  { id: "honey-chilli", name: "Honey Chilli Crispy", price: 6.9 },
  { id: "set-economy", name: "Economy Feast — 2 People", price: 25.0 },
];

const rand = (() => { let s = 42; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const ref = (p) => p + Math.random().toString(36).slice(2, 7).toUpperCase();
function dstr(off) { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

async function main() {
  // Clear transactional + non-admin data (keep migrations). Admin is upserted.
  await prisma.orderLine.deleteMany();
  await prisma.order.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany({ where: { role: "customer" } });

  const adminHash = await bcrypt.hash("admin1234", 10);
  await prisma.user.upsert({
    where: { email: "admin@sambalandsakura.co.uk" },
    update: { passwordHash: adminHash, role: "admin" },
    create: {
      email: "admin@sambalandsakura.co.uk", name: "Restaurant Admin", phone: "01642245888",
      passwordHash: adminHash, role: "admin", referralCode: "ADMIN000",
    },
  });

  const pw = await bcrypt.hash("password", 10);
  const demos = [
    { name: "Priya M.", email: "priya@example.com", phone: "07700900111", points: 1240, code: "PRIY204" },
    { name: "James O.", email: "james@example.com", phone: "07700900222", points: 560, code: "JAME118" },
    { name: "Mei L.", email: "mei@example.com", phone: "07700900333", points: 3180, code: "MEIL330" },
    { name: "Daniel K.", email: "daniel@example.com", phone: "07700900444", points: 90, code: "DANI447" },
  ];
  const users = [];
  for (const d of demos) {
    users.push(await prisma.user.create({
      data: { name: d.name, email: d.email, phone: d.phone, passwordHash: pw, role: "customer", points: d.points, referralCode: d.code },
    }));
  }

  const names = ["Priya M.", "James O.", "Mei L.", "Daniel K.", "Sofia R.", "Tom H.", "Aisha B.", "Leo W.", "Nina P."];
  const statuses = ["completed", "completed", "completed", "preparing", "out-for-delivery", "received"];
  let count = 0;
  for (let day = 13; day >= 0; day--) {
    const n = 3 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const lineCount = 1 + Math.floor(rand() * 4);
      const lines = Array.from({ length: lineCount }).map(() => { const it = pick(SAMPLE); return { itemId: it.id, name: it.name, unitPrice: it.price, qty: 1 + Math.floor(rand() * 2), modifiers: "[]" }; });
      const subtotal = Math.round(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0) * 100) / 100;
      const fulfilment = rand() > 0.4 ? "delivery" : "collection";
      const fee = fulfilment === "delivery" && subtotal < 25 ? 2.99 : 0;
      const discount = rand() > 0.78 ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
      const total = Math.max(0, Math.round((subtotal + fee - discount) * 100) / 100);
      const acc = rand() < 0.45 ? pick(users) : null;
      const status = day === 0 ? pick(statuses) : "completed";
      await prisma.order.create({
        data: {
          id: ref("SS-"), userId: acc?.id ?? null,
          customerName: acc?.name ?? pick(names), customerPhone: acc?.phone ?? "07" + Math.floor(100000000 + rand() * 899999999),
          customerEmail: acc?.email ?? null, fulfilment, status,
          subtotal, deliveryFee: fee, discount, total, pointsEarned: acc ? Math.round(total * 10) : 0,
          createdAt: new Date(Date.now() - day * 86400000 - Math.floor(rand() * 36000000)),
          lines: { create: lines },
        },
      });
      count++;
    }
  }

  const times = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30"];
  const occ = [null, "Birthday", "Date night", "Anniversary", null];
  for (let day = -3; day <= 3; day++) {
    const n = 2 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const party = 2 + Math.floor(rand() * 5);
      let status;
      if (day < 0) status = rand() > 0.15 ? "completed" : "no-show";
      else if (day === 0) status = pick(["seated", "upcoming", "upcoming", "completed", "delayed"]);
      else status = "upcoming";
      const acc = rand() < 0.4 ? pick(users) : null;
      await prisma.booking.create({
        data: {
          id: ref("BK-"), userId: acc?.id ?? null, name: acc?.name ?? pick(names),
          phone: acc?.phone ?? "07" + Math.floor(100000000 + rand() * 899999999), email: acc?.email ?? null,
          date: dstr(day), time: pick(times), party, status,
          tableId: status === "seated" ? "T" + (1 + Math.floor(rand() * 10)) : null,
          occasion: pick(occ),
        },
      });
    }
  }

  console.log(`Seeded: admin + ${users.length} customers, ${count} orders, bookings.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
