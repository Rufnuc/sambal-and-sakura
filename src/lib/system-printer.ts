"use client";

// "Windows printer" mode: print through the printer installed in Windows (USB or Bluetooth), using its
// normal driver - nothing to install or change, free. The ticket page loads in a hidden frame and the browser
// prints it. With Chrome/Edge started with --kiosk-printing it goes straight to the default printer with no
// pop-up; without it, the print window opens and staff press Print.

/** Print one of our ticket pages (e.g. /print/order/SS-ABC?copy=kitchen). Resolves once it's been sent. */
export function printPage(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    // Off-screen but laid out at receipt width (a 0x0 or hidden frame can print blank).
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:80mm;height:200px;border:0;";
    let finished = false;
    const finish = (err?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      setTimeout(() => frame.remove(), 2000);
      if (err) reject(err); else resolve();
    };
    const timer = setTimeout(() => finish(new Error("the ticket took too long to load")), 20_000);
    frame.onload = () => {
      try {
        const w = frame.contentWindow!;
        if (w.location.pathname.startsWith("/staff/login") || w.location.pathname === "/admin") { finish(new Error("signed out: sign in again")); return; }
        // Fonts and layout settle first, then print (blocks while a print window is open).
        setTimeout(() => {
          try { w.focus(); w.print(); finish(); } catch (e) { finish(e as Error); }
        }, 300);
      } catch (e) { finish(e as Error); }
    };
    frame.src = path;
    document.body.appendChild(frame);
  });
}

/** Is this computer running Windows? (Used to explain the Windows printer route.) */
export const onWindows = () => typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

export type Platform = "android" | "ios" | "windows" | "mac" | "other";
/** What kind of device this is, to pick the printer route automatically. */
export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios"; // iPadOS says "Macintosh"
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh/i.test(ua)) return "mac";
  return "other";
}

/** The computer's own printer, in plain words. */
export const systemPrinterName = (p: Platform) => (p === "windows" ? "Windows printer" : p === "mac" ? "Mac printer" : p === "ios" ? "iPad/iPhone printer" : "This device's printer");
