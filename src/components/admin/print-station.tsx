"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUsbPrinter, base64ToBytes, useUsbSupported, type UsbPrinterState } from "@/lib/usb-printer";
import { useSerialPrinter, useSerialSupported } from "@/lib/serial-printer";
import { printPage, onWindows } from "@/lib/system-printer";
import { claimPrintJobs, reportPrintFailure, fetchTicketBytes } from "@/lib/admin/api";

// The kitchen printer for this device. It lives here, around every admin page, so new orders (and STOP
// tickets) print automatically whichever admin screen is open, not only on Orders. Three free ways to reach it,
// chosen per device in Admin -> Orders:
//  - "usb":    plugged in by USB, driven by Chrome directly (the Android tablet);
//  - "serial": Bluetooth (paired in Windows, or picked in the browser) or a COM port, driven by Chrome directly;
//  - "system": the printer installed in Windows (USB or Bluetooth), through its normal driver.
// The first two send the exact kitchen ticket; "system" prints the same ticket as a page.

export type PrintMode = "usb" | "serial" | "system";
export type TicketRequest = { orderId: string; kind: "order" | "cancel" | "receipt" } | { test: true };
export interface StationPrinter {
  mode: PrintMode;
  state: UsbPrinterState;
  name: string;
  error: string;
  connect: () => Promise<void>;
}

type Station = {
  printer: StationPrinter;
  modes: PrintMode[];             // the ways this browser can print
  setMode: (m: PrintMode) => void;
  printTicket: (t: TicketRequest) => Promise<void>;
  autoPrint: boolean;
  toggleAutoPrint: () => void;
  receipt: boolean;               // also print the customer's copy after each kitchen ticket
  toggleReceipt: () => void;
  testPrint: () => Promise<void>;
};
const Ctx = createContext<Station | null>(null);
export const usePrintStation = () => useContext(Ctx);

const POLL_MS = 10_000;
const AUTO_KEY = "ss_tablet_print";   // "0" = automatic printing switched off on this device
const STATION_KEY = "ss_print_station"; // "1" = this device has had the printer connected before
const RECEIPT_KEY = "ss_tablet_receipt"; // "0" = don't print the customer receipt on this device
const MODE_KEY = "ss_print_mode";      // usb | serial | system

const read = (k: string) => { try { return typeof window === "undefined" ? null : localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function PrintStation({ canPrint, children }: { canPrint: boolean; children: React.ReactNode }) {
  const usbOk = useUsbSupported(), serialOk = useSerialSupported();
  const modes: PrintMode[] = [...(usbOk ? ["usb" as const] : []), ...(serialOk ? ["serial" as const] : []), "system"];
  const [savedMode, setSavedMode] = useState<PrintMode | null>(() => { const m = read(MODE_KEY); return m === "usb" || m === "serial" || m === "system" ? m : null; });
  // Until staff choose: USB where the browser can do it (the Android tablet), else the Windows printer.
  const mode: PrintMode = savedMode && modes.includes(savedMode) ? savedMode : usbOk ? "usb" : "system";

  const usb = useUsbPrinter(mode === "usb");
  const ser = useSerialPrinter(mode === "serial");
  const direct = mode === "usb" ? usb : mode === "serial" ? ser : null;
  let error = direct?.error ?? "";
  // On Windows the USB route usually fails because Windows' own printer driver holds the printer.
  if (mode === "usb" && error && onWindows() && /claim|access denied|security|unable to open/i.test(error)) {
    error = "Windows is using this printer: choose \"Windows printer\" (or Bluetooth) above instead";
  }
  const printer: StationPrinter = direct
    ? { mode, state: direct.state, name: direct.name, error, connect: direct.connect }
    : { mode, state: "connected", name: "Windows printer", error: "", connect: async () => {} };
  const connected = printer.state === "connected";

  const [autoPrint, setAutoPrint] = useState(() => read(AUTO_KEY) !== "0");
  const [receipt, setReceipt] = useState(() => read(RECEIPT_KEY) !== "0");
  const [wasStation, setWasStation] = useState(() => read(STATION_KEY) === "1");
  const printing = useRef(false);
  const directPrint = direct?.print;

  // Remember that this device is the printing one, so it can warn when the printer goes missing.
  useEffect(() => {
    if (!connected || wasStation || mode === "system") return;
    write(STATION_KEY, "1");
    const t = setTimeout(() => setWasStation(true), 0);
    return () => clearTimeout(t);
  }, [connected, wasStation, mode]);

  /** One ticket, whichever way this device prints. Throws if it can't. */
  const printTicket = useCallback(async (t: TicketRequest) => {
    if (mode === "system") {
      if ("test" in t) return printPage("/print/test?embed=1");
      const copy = t.kind === "order" ? "kitchen" : t.kind;
      return printPage(`/print/order/${encodeURIComponent(t.orderId)}?copy=${copy}&embed=1`);
    }
    if (!directPrint) throw new Error("No printer connected.");
    const b64 = await fetchTicketBytes("test" in t ? { test: true, receipt } : t);
    if (!b64) throw new Error("Couldn't get the ticket.");
    await directPrint(base64ToBytes(b64));
  }, [mode, directPrint, receipt]);

  /** Take any tickets waiting and print them, in order. */
  const drain = useCallback(async () => {
    if (printing.current) return;
    printing.current = true;
    try {
      const jobs = await claimPrintJobs(receipt);
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        try {
          if (mode === "system") {
            await printTicket({ orderId: job.orderId, kind: job.kind });
            if (job.kind === "order" && receipt) await printTicket({ orderId: job.orderId, kind: "receipt" });
          } else {
            await directPrint!(base64ToBytes(job.bytes)); // kitchen ticket (+ customer copy) in one go
          }
          if (job.kind === "cancel") toast.error(`Printed STOP ticket for ${job.orderId}`);
        } catch (e) {
          await reportPrintFailure(job.orderId, job.kind, (e as Error).message);
          toast.error(`Couldn't print ${job.orderId}: ${(e as Error).message}`, { duration: 15_000 });
          // Printer problem: stop here, and hand back every ticket this device took but didn't print,
          // so none is lost (they show as failed on Orders and are offered again).
          for (const rest of jobs.slice(i + 1)) await reportPrintFailure(rest.orderId, rest.kind, "not printed: the printer stopped on an earlier ticket");
          break;
        }
      }
    } finally { printing.current = false; }
  }, [mode, directPrint, printTicket, receipt]);

  // While the printer is ready: print straight away, then check every 10 s, when the screen comes
  // back on and when the internet returns.
  useEffect(() => {
    if (!canPrint || !connected || !autoPrint) return;
    const now = () => { void drain(); };
    now();
    const id = setInterval(now, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") now(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", now);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", now); };
  }, [canPrint, connected, autoPrint, drain]);

  const setMode = useCallback((m: PrintMode) => { write(MODE_KEY, m); setSavedMode(m); }, []);
  const toggleAutoPrint = useCallback(() => setAutoPrint((v) => { write(AUTO_KEY, v ? "0" : "1"); return !v; }), []);
  const toggleReceipt = useCallback(() => setReceipt((v) => { write(RECEIPT_KEY, v ? "0" : "1"); return !v; }), []);

  const testPrint = useCallback(async () => {
    try { await printTicket({ test: true }); toast.success("Test ticket sent to the printer"); }
    catch (e) { toast.error((e as Error).message); }
  }, [printTicket]);

  return (
    <Ctx.Provider value={{ printer, modes, setMode, printTicket, autoPrint, toggleAutoPrint, receipt, toggleReceipt, testPrint }}>
      {canPrint && wasStation && !connected && printer.state !== "unsupported" && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-sambal/40 bg-sambal/10 px-3 py-2 text-sm text-sambal">
          <Printer className="size-4 shrink-0" />
          <span className="mr-auto">Kitchen printer not connected{printer.error ? ` (${printer.error})` : ""}. {mode === "serial" ? "Switch the printer on: it reconnects by itself." : "Plug it back in by USB: it reconnects by itself."} If it doesn&apos;t, tap Connect.</span>
          <Button size="sm" className="h-8" onClick={() => void printer.connect()}>Connect printer</Button>
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
