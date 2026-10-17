"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, MoreVertical, PlusSquare } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Device = "ios" | "android" | "mac-safari" | "chromium" | "firefox" | "other";

const noSubscribe = () => () => {};
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
function detect(): Device {
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return "android";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Edg\/|Chrome\//.test(ua)) return "chromium";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return "mac-safari";
  return "other";
}

// Step-by-step for browsers that don't offer a one-tap install (or haven't offered it yet).
const STEPS: Record<Device, { title: string; steps: React.ReactNode[] }> = {
  ios: { title: "iPhone / iPad", steps: [
    <>Open this page in <strong>Safari</strong> (on iOS 16.4 or later, Chrome works too).</>,
    <>Tap the <strong>Share</strong> button <Share className="inline size-4" /> (Safari: bottom of the screen on iPhone, top on iPad; Chrome: in the address bar).</>,
    <>Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare className="inline size-4" />, then <strong>Add</strong>.</>,
    <>Open <strong>S&amp;S Orders</strong> from the home screen, sign in, and tap the screen once to turn the alarm on.</>,
  ] },
  android: { title: "Android", steps: [
    <>Open this page in <strong>Chrome</strong>.</>,
    <>Tap the menu <MoreVertical className="inline size-4" /> (top right).</>,
    <>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong> → <strong>Install</strong>).</>,
    <>Open <strong>S&amp;S Orders</strong> from the home screen and tap the screen once to turn the alarm on.</>,
  ] },
  chromium: { title: "Chrome / Edge on a computer", steps: [
    <>Click the <strong>install icon</strong> at the right end of the address bar, if you see one.</>,
    <>Otherwise open the menu <MoreVertical className="inline size-4" /> → <strong>Cast, save and share</strong> → <strong>Install page as app…</strong> (Edge: <strong>Apps</strong> → <strong>Install this site as an app</strong>).</>,
    <>Click <strong>Install</strong>. It opens in its own window and appears with your other apps.</>,
  ] },
  "mac-safari": { title: "Safari on a Mac", steps: [
    <>In the menu bar choose <strong>File</strong> → <strong>Add to Dock…</strong></>,
    <>Click <strong>Add</strong>. S&amp;S Orders appears in the Dock and opens in its own window.</>,
  ] },
  firefox: { title: "Firefox", steps: [
    <>Firefox on a computer can&apos;t install web apps. Open this page in <strong>Chrome</strong>, <strong>Edge</strong> or <strong>Safari</strong> and press Install app again.</>,
    <>On an Android phone, Firefox: menu ⋮ → <strong>Install</strong>.</>,
  ] },
  other: { title: "Your browser", steps: [
    <>Look in the browser&apos;s menu for <strong>Install app</strong>, <strong>Add to Home Screen</strong> or <strong>Add to Dock</strong>.</>,
    <>If there isn&apos;t one, open this page in Chrome, Edge or Safari.</>,
  ] },
};

/**
 * "Install app" for the staff admin (manifest: /admin/app.webmanifest). Always shown (except inside
 * the installed app): uses the browser's one-tap install when it offers one, otherwise shows the
 * steps for this device.
 */
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  // Browser-only facts, read safely for server rendering (assume "installed" there, so nothing flashes).
  const standalone = useSyncExternalStore(noSubscribe, isStandalone, () => true);
  const device = useSyncExternalStore(noSubscribe, detect, () => "other" as Device);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => { setJustInstalled(true); setPrompt(null); setOpen(false); toast.success("Installed - open \"S&S Orders\" from your home screen or apps."); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (standalone || justInstalled) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setPrompt(null);
      return;
    }
    setOpen(true);
  }

  const help = STEPS[device];
  return (
    <>
      <button onClick={install} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-muted">
        <Download className="size-4" /> <span className="sm:hidden">Install</span><span className="hidden sm:inline">Install app</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Install S&amp;S Orders</DialogTitle>
            <DialogDescription>Put the Orders screen on this device&apos;s home screen so it opens full-screen like an app. {help.title}:</DialogDescription>
          </DialogHeader>
          <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-sm">
            {help.steps.map((s, i) => <li key={i} className="text-pretty">{s}</li>)}
          </ol>
          <Button variant="outline" className="mt-2" onClick={() => setOpen(false)}>Got it</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
