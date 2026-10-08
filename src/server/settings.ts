import { prisma } from "@/server/db";

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}
async function writeJson(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
}

export const getBlackouts = () => readJson<string[]>("blackouts", []);
export const setBlackouts = (dates: string[]) => writeJson("blackouts", dates);

export const getDisabledZones = () => readJson<string[]>("disabledZones", []);
export const setDisabledZones = (ids: string[]) => writeJson("disabledZones", ids);
