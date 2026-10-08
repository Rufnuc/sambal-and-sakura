"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2, AlertCircle, Banknote, CheckCircle2 } from "lucide-react";
import { gbp } from "@/lib/format";

// Renders a WeChat Pay Native QR for a placed order. Falls back to a clear
// "pay cash" message when WeChat Pay isn't configured on the server.
export function WeChatPay({ orderId, total }: { orderId: string; total: number }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/pay/wechat", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && data.codeUrl) {
          const dataUrl = await QRCode.toDataURL(data.codeUrl, { width: 240, margin: 1 });
          if (!active) return;
          setQr(dataUrl); setState("ready");
        } else {
          setError(data.error ?? "Could not start WeChat payment."); setState("error");
        }
      } catch {
        if (active) { setError("Could not reach the payment service."); setState("error"); }
      }
    })();
    return () => { active = false; };
  }, [orderId]);

  // Once the QR is showing, poll until WeChat confirms payment (customer's phone → WeChat → our notify endpoint).
  useEffect(() => {
    if (state !== "ready" || paid) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/pay/wechat/status?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const d = await r.json();
        if (d.paid) setPaid(true);
      } catch { /* keep polling */ }
    }, 4000);
    return () => clearInterval(id);
  }, [state, paid, orderId]);

  if (paid) {
    return (
      <div className="rounded-2xl border border-jade/30 bg-jade/10 p-5 text-center">
        <CheckCircle2 className="mx-auto size-8 text-jade" />
        <p className="mt-2 font-display text-lg font-bold">Payment received</p>
        <p className="text-sm text-muted-foreground">Thank you - {gbp(total)} paid with WeChat Pay.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-jade/30 bg-jade/5 p-5 text-center">
      <p className="font-display text-lg font-bold">WeChat Pay</p>
      {state === "loading" && (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" /> <span>Preparing your QR…</span>
        </div>
      )}
      {state === "ready" && qr && (
        <div className="flex flex-col items-center gap-3 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="WeChat Pay QR code" className="size-52 rounded-xl bg-white p-2" />
          <p className="text-sm">扫码支付 · Scan with WeChat to pay <strong>{gbp(total)}</strong></p>
        </div>
      )}
      {state === "error" && (
        <div className="flex flex-col items-center gap-2 py-4">
          <AlertCircle className="size-6 text-sambal" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium"><Banknote className="size-4 text-jade" /> Cash on delivery / collection</p>
        </div>
      )}
    </div>
  );
}
