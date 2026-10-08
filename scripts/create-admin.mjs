// Creates the first owner/admin account on a fresh production database.
//
// - Reads ADMIN_EMAIL, ADMIN_PASSWORD (and optional ADMIN_NAME) from the environment.
// - ONLY creates the account if NO admin exists yet. It never overwrites an existing admin,
//   so a redeploy can never reset a password you changed in the app.
// - Never seeds demo data (the dev seed script creates well-known demo passwords and must
//   NEVER be run in production).
//
// Used as part of the Render pre-deploy step.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

try {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  const existing = await prisma.user.count({ where: { role: "admin" } });
  if (existing > 0) {
    console.log("Admin already exists - nothing to do.");
  } else if (!email || !password) {
    console.log("No admin yet and ADMIN_EMAIL / ADMIN_PASSWORD are not set - skipping. Set them and redeploy to create the owner account.");
  } else if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  } else {
    await prisma.user.create({
      data: {
        email,
        name: process.env.ADMIN_NAME?.trim() || "Restaurant Owner",
        phone: process.env.ADMIN_PHONE?.trim() || "",
        passwordHash: await bcrypt.hash(password, 12),
        role: "admin",
        referralCode: "ADMIN" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      },
    });
    console.log(`Created admin account for ${email}.`);
  }
} finally {
  await prisma.$disconnect();
}
