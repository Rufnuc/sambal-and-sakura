import { log, errInfo } from "@/server/log";

// Cloudflare Turnstile: a free, privacy-friendly "are you human" check (usually invisible).
// Optional: only enforced when both keys are set in the environment.
//   TURNSTILE_SITE_KEY   (public, shown to the browser)
//   TURNSTILE_SECRET_KEY (server only)
// Test keys that always pass: site 1x00000000000000000000AA, secret 1x0000000000000000000000000000000AA.

export const turnstileSiteKey = () => (process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY : null);

/** True if Turnstile is off, or the token is valid. */
export async function verifyHuman(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.TURNSTILE_SITE_KEY) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "local") body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(6000),
    });
    const d = (await r.json()) as { success?: boolean };
    return d.success === true;
  } catch (e) {
    // If Cloudflare is unreachable, let real customers through (rate limits still apply).
    log.error("turnstile_unreachable", errInfo(e));
    return true;
  }
}
