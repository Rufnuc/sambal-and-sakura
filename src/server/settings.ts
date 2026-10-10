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

// Emergency switch (Admin → Orders): stop all new online orders, e.g. during a fake-order flood,
// a kitchen problem or a power cut. The site keeps showing the menu and asks people to phone.
export const getOrdersPaused = () => readJson<boolean>("ordersPaused", false);
export const setOrdersPaused = (paused: boolean) => writeJson("ordersPaused", paused);
