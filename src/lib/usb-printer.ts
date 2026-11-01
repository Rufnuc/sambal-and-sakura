"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// A receipt printer plugged into this device by USB (the Xprinter XP-E260M on the kitchen tablet),
// driven straight from Chrome with WebUSB. Works in Chrome/Edge on Android tablets and computers;
// not on iPad/iPhone (Apple doesn't allow websites to use USB).
//
// The first time, staff tap "Connect printer" and pick it (the browser insists on that one tap).
// After that Chrome remembers it: it reconnects when the page opens and whenever it's plugged in.

/* Minimal WebUSB types (not in TypeScript's standard DOM library). */
interface USBEndpoint { endpointNumber: number; direction: "in" | "out"; type: "bulk" | "interrupt" | "isochronous" }
interface USBAlternate { interfaceClass: number; endpoints: USBEndpoint[] }
interface USBInterface { interfaceNumber: number; alternates: USBAlternate[]; claimed: boolean }
interface USBConfiguration { interfaces: USBInterface[] }
interface USBDevice {
  productName?: string; manufacturerName?: string; opened: boolean; configuration: USBConfiguration | null;
  open(): Promise<void>; close(): Promise<void>; selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>; transferOut(ep: number, data: BufferSource): Promise<{ status: string }>;
}
interface USB extends EventTarget {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(o: { filters: object[] }): Promise<USBDevice>;
}
const usb = () => (navigator as Navigator & { usb?: USB }).usb;

const PRINTER_CLASS = 7;
const CHUNK = 16 * 1024;

/** Open the device and find the endpoint we send print data to. */
async function prepare(device: USBDevice): Promise<number> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const ifaces = device.configuration!.interfaces;
  const pick = (needPrinterClass: boolean) => {
    for (const iface of ifaces) {
      const alt = iface.alternates[0];
      if (needPrinterClass && alt?.interfaceClass !== PRINTER_CLASS) continue;
      const out = alt?.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (out) return { iface, out };
    }
    return null;
  };
  const found = pick(true) ?? pick(false);
  if (!found) throw new Error("This USB device doesn't look like a printer.");
  if (!found.iface.claimed) await device.claimInterface(found.iface.interfaceNumber);
  return found.out.endpointNumber;
}

const noSubscribe = () => () => {};
export const useUsbSupported = () => useSyncExternalStore(noSubscribe, () => !!usb(), () => false);

export type UsbPrinterState = "unsupported" | "none" | "connected" | "error";

/** The tablet's USB printer: status, connect, print. */
export function useUsbPrinter(enabled = true) {
  const supported = useUsbSupported();
  const [device, setDevice] = useState<USBDevice | null>(null);
  const [error, setError] = useState("");
  const endpoint = useRef<number | null>(null);
  const busy = useRef<Promise<void>>(Promise.resolve());

  const attach = useCallback(async (d: USBDevice) => {
    try {
      endpoint.current = await prepare(d);
      setDevice(d); setError("");
    } catch (e) {
      endpoint.current = null; setDevice(null);
      setError((e as Error).message || "Couldn't open the printer.");
    }
  }, []);

  // Reconnect to a printer this browser was given before, now and whenever one is plugged in.
  useEffect(() => {
    const u = usb();
    if (!u || !enabled) return;
    let live = true;
    u.getDevices().then((list) => { if (live && list[0]) void attach(list[0]); }).catch(() => {});
    const onConnect = (e: Event) => { const d = (e as Event & { device: USBDevice }).device; if (d) void attach(d); };
    const onDisconnect = (e: Event) => {
      const d = (e as Event & { device: USBDevice }).device;
      setDevice((cur) => (cur === d ? null : cur));
      if (d) { endpoint.current = null; setError("printer unplugged"); }
    };
    u.addEventListener("connect", onConnect);
    u.addEventListener("disconnect", onDisconnect);
    return () => { live = false; u.removeEventListener("connect", onConnect); u.removeEventListener("disconnect", onDisconnect); };
  }, [attach, enabled]);

  /** Ask the browser for the printer (must be called from a tap). */
  const connect = useCallback(async () => {
    const u = usb();
    if (!u) return;
    try {
      const d = await u.requestDevice({ filters: [] }); // show every USB device: some printers don't announce the printer class
      await attach(d);
    } catch (e) {
      if ((e as Error).name !== "NotFoundError") setError((e as Error).message); // NotFoundError = closed the picker
    }
  }, [attach]);

  /** Send raw ESC/POS bytes. One job at a time, in order. Throws if it can't print. */
  const print = useCallback((bytes: Uint8Array) => {
    const run = async () => {
      if (!device || endpoint.current === null) throw new Error("No printer connected.");
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const r = await device.transferOut(endpoint.current, bytes.slice(i, i + CHUNK));
        if (r.status !== "ok") throw new Error(`Printer said "${r.status}" (check paper and lid).`);
      }
    };
    const job = busy.current.then(run, run);
    busy.current = job.catch(() => {});
    return job;
  }, [device]);

  const state: UsbPrinterState = !supported ? "unsupported" : device ? "connected" : error ? "error" : "none";
  const name = device ? [device.manufacturerName, device.productName].filter(Boolean).join(" ") || "USB printer" : "";
  return { state, name, error, connect, print };
}

export const base64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
