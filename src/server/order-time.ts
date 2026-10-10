import type { DayHours } from "@/lib/data/site";
import { ORDERING } from "@/lib/data/site";

// All ordering times are UK local time (Europe/London), whatever timezone the server runs in
// (Render runs in UTC). Handles the clock changes in March and October.

const TZ = "Europe/London";
const STEP_MINS = 15;
const DAYS_AHEAD = 7;
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface UkParts { y: number; m: number; d: number; dow: number; minutes: number; dateKey: string }

export function ukParts(at: Date): UkParts {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false })
      .formatToParts(at).map((x) => [x.type, x.value]),
  );
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  const hour = Number(p.hour) % 24; // some engines print midnight as 24
  return { y, m, d, dow: SHORT_DAYS.indexOf(p.weekday), minutes: hour * 60 + Number(p.minute), dateKey: `${p.year}-${p.month}-${p.day}` };
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** The UTC instant for a UK wall-clock time, e.g. ukToUtc("2026-10-25", "19:00"). */
export function ukToUtc(dateKey: string, hhmm: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, ...hhmm.split(":").map(Number) as [number, number]);
  // Start from the naive UTC guess and correct by London's offset at that moment (twice, for DST edges).
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = ukParts(new Date(guess));
    const shown = Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes / 60), p.minutes % 60);
    guess += target - shown;
  }
  return new Date(guess);
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
export function isRealDate(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";
  if (dateKey === addDays(todayKey, 1)) return "Tomorrow";
  const [, m, d] = dateKey.split("-").map(Number);
  return `${SHORT_DAYS[dayOfWeek(dateKey)]} ${d} ${SHORT_MONTHS[m - 1]}`;
}

/** "Sat 11 Oct 19:00" - printed on tickets and shown to staff. */
export function scheduleLabel(dateKey: string, hhmm: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${SHORT_DAYS[dayOfWeek(dateKey)]} ${d} ${SHORT_MONTHS[m - 1]} ${hhmm}`;
}

export interface OrderTiming {
  paused: boolean;
  asap: { ok: boolean; reason?: string };
  leadHours: number;
  days: { date: string; label: string; times: string[] }[];
}

/**
 * When can an order be placed for? ASAP only while open (and not too close to closing);
 * scheduled times inside opening hours, after prep time and any pre-order notice, never on a
 * blackout date, up to a week ahead.
 */
export function orderTiming(opts: { hours: DayHours[]; blackouts: string[]; leadHours: number; paused: boolean; now?: Date }): OrderTiming {
  const now = opts.now ?? new Date();
  const today = ukParts(now);
  const leadMins = Math.max(0, opts.leadHours) * 60;
  const earliest = now.getTime() + Math.max(ORDERING.prepTimeMin, leadMins) * 60_000;

  let asap: OrderTiming["asap"];
  if (opts.paused) asap = { ok: false, reason: "We're not taking online orders right now. Please call us." };
  else if (opts.blackouts.includes(today.dateKey)) asap = { ok: false, reason: "We're closed today." };
  else if (leadMins > 0) asap = { ok: false, reason: `Your basket has a dish that needs ${opts.leadHours} hours' notice, so please pick a time.` };
  else {
    const session = (opts.hours[today.dow]?.sessions ?? []).find((s) => today.minutes >= toMin(s.open) && today.minutes < toMin(s.close));
    if (!session) asap = { ok: false, reason: "We're closed right now - you can schedule an order for later." };
    else if (today.minutes > toMin(session.close) - ORDERING.asapCutoffBeforeCloseMins) asap = { ok: false, reason: "We've stopped taking ASAP orders for this session - please pick a later time." };
    else asap = { ok: true };
  }

  const days: OrderTiming["days"] = [];
  if (!opts.paused) {
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = addDays(today.dateKey, i);
      if (opts.blackouts.includes(date)) continue;
      const times: string[] = [];
      for (const s of opts.hours[dayOfWeek(date)]?.sessions ?? []) {
        const first = Math.ceil((toMin(s.open) + ORDERING.prepTimeMin) / STEP_MINS) * STEP_MINS;
        const last = toMin(s.close) - STEP_MINS;
        for (let t = first; t <= last; t += STEP_MINS) {
          const hhmm = toHHMM(t);
          if (ukToUtc(date, hhmm).getTime() >= earliest) times.push(hhmm);
        }
      }
      if (times.length) days.push({ date, label: dayLabel(date, today.dateKey), times });
    }
  }
  return { paused: opts.paused, asap, leadHours: opts.leadHours, days };
}

export type WhenResult =
  | { ok: true; whenType: "asap"; scheduledAt: null; label: null }
  | { ok: true; whenType: "scheduled"; scheduledAt: Date; label: string }
  | { ok: false; error: string };

/** Validate what the customer chose against the timing rules. `scheduledFor` is "YYYY-MM-DD HH:MM" (UK). */
export function checkWhen(whenType: "asap" | "scheduled", scheduledFor: string | undefined, timing: OrderTiming): WhenResult {
  if (timing.paused) return { ok: false, error: timing.asap.reason ?? "Online ordering is paused." };
  if (whenType === "asap") return timing.asap.ok ? { ok: true, whenType: "asap", scheduledAt: null, label: null } : { ok: false, error: timing.asap.reason ?? "ASAP isn't available." };
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(scheduledFor ?? "");
  if (!m || !isRealDate(m[1])) return { ok: false, error: "Please choose a time for your order." };
  const day = timing.days.find((d) => d.date === m[1]);
  if (!day || !day.times.includes(m[2])) return { ok: false, error: "That time is no longer available - please pick another." };
  return { ok: true, whenType: "scheduled", scheduledAt: ukToUtc(m[1], m[2]), label: scheduleLabel(m[1], m[2]) };
}
