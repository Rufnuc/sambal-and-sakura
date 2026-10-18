"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUsbPrinter, base64ToBytes } from "@/lib/usb-printer";
import { claimPrintJobs, reportPrintFailure, fetchTicketBytes } from "@/lib/admin/api";

// The kitchen printer plugged into this tablet by USB. It lives here, around every admin page, so new
// orders (and STOP tickets) print automatically whichever admin screen is open, not only on Orders.
// Chrome reconnects to the printer by itself when the page opens and whenever it's plugged back in.

type Station = {
  printer: ReturnType<typeof useUsbPrinter>;
  autoPrint: boolean;
  toggleAutoPrint: () => void;
  receipt: boolean;               // also print the customer's copy after each kitchen ticket
  toggleReceipt: () => void;
  testPrint: () => Promise<void>;
};
const Ctx = createContext<Station | null>(null);
export const usePrintStation = () => useContext(Ctx);

const POLL_MS = 10_000;
const AUTO_KEY = "ss_tablet_print";   // "0" = automatic printing switched off on this tablet
const STATION_KEY = "ss_print_station"; // "1" = this tablet has had the printer connected before
const RECEIPT_KEY = "ss_tablet_receipt"; // "0" = don't print the customer receipt on this tablet

export function PrintStation({ canPrint, children }: { canPrint: boolean; children: React.ReactNode }) {
  const printer = useUsbPrinter();
  const [autoPrint, setAutoPrint] = useState(() => { try { return typeof window === "undefined" || localStorage.getItem(AUTO_KEY) !== "0"; } catch { return true; } });
  const [receipt, setReceipt] = useState(() => { try { return typeof window === "undefined" || localStorage.getItem(RECEIPT_KEY) !== "0"; } catch { return true; } });
  const [wasStation, setWasStation] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem(STATION_KEY) === "1"; } catch { return false; } });
  const printing = useRef(false);
  const { state, print } = printer;
  const connected = state === "connected";

  // Remember that this tablet is the printing one, so it can warn when the printer goes missing.
  useEffect(() => {
    if (!connected || wasStation) return;
    try { localStorage.setItem(STATION_KEY, "1"); } catch { /* ignore */ }
    const t = setTimeout(() => setWasStation(true), 0);
    return () => clearTimeout(t);
  }, [connected, wasStation]);

  /** Take any tickets waiting and print them, in order. */
  const drain = useCallback(async () => {
    if (printing.current) return;
    printing.current = true;
    try {
      const jobs = await claimPrintJobs(receipt);
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        try {
          await print(base64ToBytes(job.bytes));
          if (job.kind === "cancel") toast.error(`Printed STOP ticket for ${job.orderId}`);
        } catch (e) {
          await reportPrintFailure(job.orderId, job.kind, (e as Error).message);
          toast.error(`Couldn't print ${job.orderId}: ${(e as Error).message}`, { duration: 15_000 });
          // Printer problem: stop here, and hand back every ticket this tablet took but didn't print,
          // so none is lost (they show as failed on Orders and are offered again).
          for (const rest of jobs.slice(i + 1)) await reportPrintFailure(rest.orderId, rest.kind, "not printed: the printer stopped on an earlier ticket");
          break;
        }
      }
    } finally { printing.current = false; }
  }, [print, receipt]);

  // While the printer is connected: print straight away, then check every 10 s, when the screen comes
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

  const toggleAutoPrint = useCallback(() => {
    setAutoPrint((v) => {
      try { localStorage.setItem(AUTO_KEY, v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  }, []);

  const toggleReceipt = useCallback(() => {
    setReceipt((v) => {
      try { localStorage.setItem(RECEIPT_KEY, v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  }, []);

  const testPrint = useCallback(async () => {
    const b64 = await fetchTicketBytes({ test: true, receipt });
    if (!b64) { toast.error("Couldn't get the test ticket."); return; }
    try { await print(base64ToBytes(b64)); toast.success("Test ticket sent to the printer"); }
    catch (e) { toast.error((e as Error).message); }
  }, [print, receipt]);

  return (
    <Ctx.Provider value={{ printer, autoPrint, toggleAutoPrint, receipt, toggleReceipt, testPrint }}>
      {canPrint && wasStation && !connected && state !== "unsupported" && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-sambal/40 bg-sambal/10 px-3 py-2 text-sm text-sambal">
          <Printer className="size-4 shrink-0" />
          <span className="mr-auto">Kitchen printer not connected{printer.error ? ` (${printer.error})` : ""}. Plug it back in by USB: it reconnects by itself. If it doesn&apos;t, tap Connect.</span>
          <Button size="sm" className="h-8" onClick={() => void printer.connect()}>Connect printer</Button>
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
