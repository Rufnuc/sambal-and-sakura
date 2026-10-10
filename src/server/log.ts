// Structured logging + owner alerts.
//
// Every line is one JSON object on stdout, which Render keeps and lets you search
// (e.g. search for "print_failed"). Never log secrets, passwords or full card/payment data.
//
// Alerts: set ALERT_WEBHOOK_URL to get a push for things a human must act on (failed print,
// order not picked up, WeChat payment problem...). It is POSTed as plain text, which works with
// ntfy.sh (free phone push: ALERT_WEBHOOK_URL=https://ntfy.sh/<your-secret-topic>), and with
// Slack/Discord-style webhooks that accept a text body.

type Level = "info" | "warn" | "error";

function write(level: Level, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};

/** Turn an unknown thrown value into something safe to log. */
export function errInfo(e: unknown): { error: string } {
  if (e instanceof Error) return { error: `${e.name}: ${e.message}`.slice(0, 500) };
  return { error: String(e).slice(0, 500) };
}

// Don't spam the owner: the same alert key fires at most once per 10 minutes per server.
const lastSent = new Map<string, number>();
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;

/** Log at warn level and, if configured, push a short message to the owner. Never throws. */
export async function alertOwner(key: string, message: string, data?: Record<string, unknown>): Promise<void> {
  log.warn("alert", { key, message, ...data });
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - ALERT_COOLDOWN_MS) return;
  lastSent.set(key, now);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8", Title: "Sambal & Sakura" },
      body: message.slice(0, 1000),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    log.error("alert_send_failed", { key, ...errInfo(e) });
  }
}
