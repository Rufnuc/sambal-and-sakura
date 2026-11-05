import { RESTAURANT, type DayHours, type HoursSession } from "@/lib/data/site";

export interface OpenState {
  open: boolean;
  label: string;
  closesAt?: string;
  opensDay?: string;
  opensAt?: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Does this session take delivery orders? Collection always can. A session the owner hasn't set follows the
 * usual rule: no delivery at lunchtime (a session ending by 16:00) Monday-Saturday; Sunday delivers all day.
 * `dow`: 0 = Sunday.
 */
export function sessionDelivers(s: HoursSession, dow: number): boolean {
  return s.delivery ?? (dow === 0 || toMinutes(s.close) > 16 * 60);
}

/**
 * Human-readable hours for a day, e.g. "11:30–14:00, 17:00–22:00" or "Closed". With `dow` (0 = Sunday),
 * sessions without delivery say so: "11:30–14:00 (collection only), 17:00–22:00".
 */
export function formatHours(day: DayHours, dow?: number): string {
  if (!day.sessions.length) return "Closed";
  return day.sessions.map((s) => `${s.open}–${s.close}${dow !== undefined && !sessionDelivers(s, dow) ? " (collection only)" : ""}`).join(", ");
}

/**
 * Compute open/closed state across split sessions.
 * `now` is injectable for deterministic rendering/tests.
 */
export function getOpenState(hours: DayHours[] = RESTAURANT.hours, now: Date = new Date()): OpenState {
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = hours[day];

  // Open right now?
  for (const s of today?.sessions ?? []) {
    if (mins >= toMinutes(s.open) && mins < toMinutes(s.close)) {
      return { open: true, label: `Open now · until ${s.close}`, closesAt: s.close };
    }
  }

  // Opening later today?
  for (const s of today?.sessions ?? []) {
    if (mins < toMinutes(s.open)) {
      return { open: false, label: `Closed · opens today ${s.open}`, opensDay: today.day, opensAt: s.open };
    }
  }

  // Next day with a session.
  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7;
    const h = hours[d];
    if (h?.sessions.length) {
      return { open: false, label: `Closed · opens ${h.day} ${h.sessions[0].open}`, opensDay: h.day, opensAt: h.sessions[0].open };
    }
  }
  return { open: false, label: "Closed" };
}
