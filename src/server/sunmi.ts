import { createHmac, randomInt } from "node:crypto";

// Sunmi Cloud Print (OpenAPI): the server sends a print job to Sunmi's cloud, and the Wi-Fi/Ethernet
// printer collects it. No computer is needed at the restaurant.
//
// Built from the open-source Sunmi SDK that implements this API (github.com/louismax/sunmi-go-sdk):
//   - POST {base}/v2/printer/open/open/device/pushContent   body: { sn, trade_no, content (ESC/POS as hex), count, ... }
//   - POST {base}/v2/printer/open/open/device/onlineStatus  body: { sn }
//   - every request is signed: HMAC-SHA256(key = appKey) over  body + appId + timestamp + nonce  (hex, lowercase),
//     sent in the headers Sunmi-Appid, Sunmi-Timestamp (unix seconds), Sunmi-Nonce (6 digits), Sunmi-Sign.
// The first real print is verified from the admin ("Send test print"), which also shows Sunmi's raw reply.
//
// Needs (from the Sunmi developer / cloud-printing partner account; never hard-coded):
//   SUNMI_APP_ID, SUNMI_APP_KEY, SUNMI_PRINTER_SN   (optional: SUNMI_API_URL, SUNMI_VOICE=1)

const BASE = (process.env.SUNMI_API_URL || "https://openapi.sunmi.com").replace(/\/+$/, "");
const PATH_PUSH = "/v2/printer/open/open/device/pushContent";
const PATH_ONLINE = "/v2/printer/open/open/device/onlineStatus";

export interface SunmiConfig { appId: string; appKey: string; sn: string }

export function getSunmiConfig(): SunmiConfig | null {
  const appId = process.env.SUNMI_APP_ID?.trim();
  const appKey = process.env.SUNMI_APP_KEY?.trim();
  const sn = process.env.SUNMI_PRINTER_SN?.trim();
  return appId && appKey && sn ? { appId, appKey, sn } : null;
}

/** HMAC-SHA256 over body + appId + timestamp + nonce, keyed with the app key, lowercase hex. */
export function signRequest(body: string, appId: string, appKey: string, timestamp: string, nonce: string): string {
  return createHmac("sha256", appKey).update(body + appId + timestamp + nonce).digest("hex");
}

export interface SunmiReply { ok: boolean; message: string; raw: string }

async function call(cfg: SunmiConfig, path: string, params: Record<string, unknown>): Promise<SunmiReply> {
  const body = JSON.stringify(params); // the SAME string is signed and sent
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = String(randomInt(0, 1_000_000)).padStart(6, "0");
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Source: "openapi",
        "Sunmi-Appid": cfg.appId,
        "Sunmi-Timestamp": timestamp,
        "Sunmi-Nonce": nonce,
        "Sunmi-Sign": signRequest(body, cfg.appId, cfg.appKey, timestamp, nonce),
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const raw = (await res.text()).slice(0, 600);
    if (!res.ok) return { ok: false, message: `Sunmi returned HTTP ${res.status}`, raw };
    let json: { code?: unknown; msg?: unknown; message?: unknown } | null = null;
    try { json = JSON.parse(raw); } catch { /* not JSON */ }
    // Sunmi's envelope is {code, msg, data}. Success codes are not publicly documented in a place I could read,
    // so accept the usual ones and surface anything else together with Sunmi's own message.
    if (json && json.code !== undefined && ![0, 1, 200, "0", "1", "200"].includes(json.code as never)) {
      return { ok: false, message: `Sunmi said: ${String(json.msg ?? json.message ?? "error")} (code ${String(json.code)})`, raw };
    }
    return { ok: true, message: "Sent to Sunmi", raw };
  } catch (e) {
    return { ok: false, message: `Could not reach Sunmi: ${(e as Error).message}`, raw: "" };
  }
}

/** Queue a print job. `content` is the ESC/POS bytes as a hex string. */
export async function sunmiPush(tradeNo: string, contentHex: string, voiceText?: string): Promise<SunmiReply> {
  const cfg = getSunmiConfig();
  if (!cfg) return { ok: false, message: "Sunmi printer is not configured", raw: "" };
  const params: Record<string, unknown> = {
    sn: cfg.sn,
    trade_no: tradeNo.replace(/[^A-Za-z0-9]/g, "").slice(0, 60),
    content: contentHex,
    count: 1,
  };
  // Optional spoken "new order" announcement (only on printers with a speaker); off unless SUNMI_VOICE=1.
  if (voiceText && process.env.SUNMI_VOICE === "1") params.media_text = voiceText;
  return call(cfg, PATH_PUSH, params);
}

/** Is the printer connected to Sunmi's cloud right now? */
export async function sunmiOnline(): Promise<SunmiReply> {
  const cfg = getSunmiConfig();
  if (!cfg) return { ok: false, message: "Sunmi printer is not configured", raw: "" };
  return call(cfg, PATH_ONLINE, { sn: cfg.sn });
}
