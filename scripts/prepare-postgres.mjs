// Derives the production (PostgreSQL) Prisma schema from the single source of truth,
// prisma/schema.prisma (SQLite, used for local dev). Only the datasource provider differs,
// so the two can never drift apart. Output: prisma/postgres/schema.prisma
//
// Used by the Render build:  node scripts/prepare-postgres.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const src = readFileSync("prisma/schema.prisma", "utf8");
if (!/provider\s*=\s*"sqlite"/.test(src)) throw new Error('prisma/schema.prisma no longer uses provider = "sqlite"');

const pg = src
  .replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')
  .replace(/^\/\/ Sambal & Sakura.*\n\/\/ PostgreSQL.*\n/m, "// GENERATED from prisma/schema.prisma by scripts/prepare-postgres.mjs - do not edit.\n");

mkdirSync("prisma/postgres", { recursive: true });
writeFileSync("prisma/postgres/schema.prisma", pg);
console.log("Wrote prisma/postgres/schema.prisma");
