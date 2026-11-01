"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { UsbPrinterState } from "@/lib/usb-printer";

// A receipt printer reached as a serial port, driven straight from Chrome/Edge with Web Serial (free, no app):
//  - a Bluetooth printer paired in Windows (it appears as "Standard Serial over Bluetooth link (COMx)"),
//    or picked directly in the browser's list (Bluetooth Serial Port Profile);
//  - a USB printer that shows up as a COM port.
// Same ESC/POS tickets as the USB route. Chrome remembers the printer and reconnects when the page opens.
// Works in Chrome/Edge on Windows, Mac and ChromeOS; not on iPad/iPhone or (yet) Android.

/* Minimal Web Serial types (not in TypeScript's standard DOM library). */
interface SerialPortInfo { usbVendorId?: number; usbProductId?: number; bluetoothServiceClassId?: number | string }
interface SerialPort extends EventTarget {
  readonly writable: WritableStream<Uint8Array> | null;
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>;
  requestPort(o?: { filters?: object[]; allowedBluetoothServiceClassIds?: (number | string)[] }): Promise<SerialPort>;
}
const serial = () => (navigator as Navigator & { serial?: Serial }).serial;

const SPP = "00001101-0000-1000-8000-00805f9b34fb"; // Bluetooth Serial Port Profile: what receipt printers use
const BAUD = 9600;   // ignored over Bluetooth; the usual default for receipt printers on a COM port
const CHUNK = 512;   // small pieces with a short pause, so a Bluetooth printer's buffer never overflows
const PAUSE_MS = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Has this browser been given a serial/Bluetooth printer before? (No prompt.) */
export const hasGrantedSerial = async () => { try { return ((await serial()?.getPorts()) ?? []).length > 0; } catch { return false; } };

const noSubscribe = () => () => {};
export const useSerialSupported = () => useSyncExternalStore(noSubscribe, () => !!serial(), () => false);

function portName(p: SerialPort): string {
  const i = p.getInfo();
  return i.bluetoothServiceClassId ? "Bluetooth printer" : i.usbVendorId ? "USB printer (COM port)" : "Printer on a COM port (e.g. Bluetooth)";
}

/** The printer on a serial port (Bluetooth or COM): status, connect, print. Same shape as useUsbPrinter. */
export function useSerialPrinter(enabled: boolean) {
  const supported = useSerialSupported();
  const [port, setPort] = useState<SerialPort | null>(null);
  const [error, setError] = useState("");
  const busy = useRef<Promise<void>>(Promise.resolve());

  const attach = useCallback(async (p: SerialPort) => {
    try {
      if (!p.writable) await p.open({ baudRate: BAUD });
      setPort(p); setError("");
    } catch (e) {
      setPort(null);
      setError(/already open/i.test((e as Error).message) ? "another app or tab is using the printer" : "couldn't open it: check it's switched on, paired and in range");
    }
  }, []);

  // Reconnect to the printer this browser was given before, now and whenever it comes back.
  useEffect(() => {
    const s = serial();
    if (!s || !enabled) return;
    let live = true;
    s.getPorts().then((list) => { if (live && list[0]) void attach(list[0]); }).catch(() => {});
    const onConnect = (e: Event) => { if (e.target) void attach(e.target as SerialPort); };
    const onDisconnect = (e: Event) => { setPort((cur) => (cur === e.target ? null : cur)); setError("printer switched off or out of range"); };
    s.addEventListener("connect", onConnect);
    s.addEventListener("disconnect", onDisconnect);
    return () => { live = false; s.removeEventListener("connect", onConnect); s.removeEventListener("disconnect", onDisconnect); };
  }, [attach, enabled]);

  /** Ask the browser for the printer (must be called from a tap). */
  const connect = useCallback(async (): Promise<boolean> => {
    const s = serial();
    if (!s) return false;
    try {
      const p = await s.requestPort({ allowedBluetoothServiceClassIds: [SPP] });
      await attach(p);
      return true;
    } catch (e) {
      if ((e as Error).name !== "NotFoundError") setError((e as Error).message); // NotFoundError = closed the list
      return false;
    }
  }, [attach]);

  /** Send raw ESC/POS bytes. One job at a time, in order. Throws if it can't print. */
  const print = useCallback((bytes: Uint8Array) => {
    const run = async () => {
      if (!port?.writable) throw new Error("No printer connected.");
      const writer = port.writable.getWriter();
      try {
        for (let i = 0; i < bytes.length; i += CHUNK) {
          await writer.write(bytes.slice(i, i + CHUNK));
          await sleep(PAUSE_MS);
        }
      } finally { writer.releaseLock(); }
    };
    const job = busy.current.then(run, run);
    busy.current = job.catch(() => {});
    return job;
  }, [port]);

  const state: UsbPrinterState = !supported ? "unsupported" : port ? "connected" : error ? "error" : "none";
  return { state, name: port ? portName(port) : "", error, connect, print };
}
