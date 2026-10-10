// First-time setup helper for the Sunmi cloud printer. Shows Sunmi's raw reply so problems are easy to read.
//
//   node --env-file=.env scripts/sunmi.mjs status          is the printer online?
//   node --env-file=.env scripts/sunmi.mjs bind <shopId>   link the printer to your shop (once, if Sunmi asks for it)
//   node --env-file=.env scripts/sunmi.mjs unbind <shopId>
//   node --env-file=.env scripts/sunmi.mjs clear           clear jobs stuck in the cloud queue
//   node --env-file=.env scripts/sunmi.mjs hello           print a tiny "hello" ticket
//
// Needs SUNMI_APP_ID, SUNMI_APP_KEY, SUNMI_PRINTER_SN in .env. Same signing as src/server/sunmi.ts.

import { createHmac, randomInt } from "node:crypto";

const BASE = (process.env.SUNMI_API_URL || "https://openapi.sunmi.com").replace(/\/+$/, "");
const { SUNMI_APP_ID: appId, SUNMI_APP_KEY: appKey, SUNMI_PRINTER_SN: sn } = process.env;
if (!appId || !appKey || !sn) { console.error("Set SUNMI_APP_ID, SUNMI_APP_KEY and SUNMI_PRINTER_SN in .env first."); process.exit(1); }

async function call(path, params) {
  const body = JSON.stringify(params);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const sign = createHmac("sha256", appKey).update(body + appId + timestamp + nonce).digest("hex");
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Source: "openapi", "Sunmi-Appid": appId, "Sunmi-Timestamp": timestamp, "Sunmi-Nonce": nonce, "Sunmi-Sign": sign },
    body, signal: AbortSignal.timeout(10000),
  });
  console.log(`HTTP ${res.status}`);
  console.log(await res.text());
}

const P = "/v2/printer/open/open/device";
const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case "status": await call(`${P}/onlineStatus`, { sn }); break;
  case "bind": if (!arg) throw new Error("Usage: bind <shopId>"); await call(`${P}/bindShop`, { sn, shop_id: Number(arg) }); break;
  case "unbind": if (!arg) throw new Error("Usage: unbind <shopId>"); await call(`${P}/unbindShop`, { sn, shop_id: Number(arg) }); break;
  case "clear": await call(`${P}/clearPrintJob`, { sn }); break;
  case "hello": {
    // ESC @, centred, text, feed, partial cut
    const bytes = Buffer.concat([Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]), Buffer.from("HELLO from Sambal & Sakura\n\n\n\n", "utf8"), Buffer.from([0x1d, 0x56, 0x42, 0x00])]);
    await call(`${P}/pushContent`, { sn, trade_no: "HELLO" + Date.now().toString(36), content: bytes.toString("hex"), count: 1 });
    break;
  }
  default: console.log("Commands: status | bind <shopId> | unbind <shopId> | clear | hello");
}
