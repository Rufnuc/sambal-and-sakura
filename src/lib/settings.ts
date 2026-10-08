// Operator-tunable settings persisted locally (demo). In production these move
// to a database behind the admin API. Pure localStorage helpers (window-guarded).

const BLACKOUTS_KEY = "ss_blackouts";      // string[] of YYYY-MM-DD closed dates
const ZONES_KEY = "ss_zone_disabled";      // string[] of disabled delivery zone ids

function read(key: string): string[] {
  if (typeof window === "undefined") return [];
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function write(key: string, list: string[]) {
  try { window.localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ }
}

export function readBlackouts(): string[] { return read(BLACKOUTS_KEY); }
export function isBlackout(date: string): boolean { return read(BLACKOUTS_KEY).includes(date); }
export function addBlackout(date: string): string[] {
  const list = read(BLACKOUTS_KEY);
  if (!list.includes(date)) list.push(date);
  list.sort();
  write(BLACKOUTS_KEY, list);
  return list;
}
export function removeBlackout(date: string): string[] {
  const list = read(BLACKOUTS_KEY).filter((d) => d !== date);
  write(BLACKOUTS_KEY, list);
  return list;
}

export function readDisabledZones(): string[] { return read(ZONES_KEY); }
export function isZoneDisabled(id: string): boolean { return read(ZONES_KEY).includes(id); }
export function toggleZone(id: string): string[] {
  const list = read(ZONES_KEY);
  const next = list.includes(id) ? list.filter((z) => z !== id) : [...list, id];
  write(ZONES_KEY, next);
  return next;
}
