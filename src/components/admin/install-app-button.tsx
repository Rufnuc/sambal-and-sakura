"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Install app" for the staff admin (manifest: /admin/app.webmanifest). Chrome/Edge/Android offer a
 * real install prompt; iPhone/iPad Safari has no prompt, so we explain Share -> Add to Home Screen.
 * Hidden when already running as the installed app.
 */
const noSubscribe = () => () => {};
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  // Browser-only facts, read safely for server rendering (assume "installed" there, so nothing flashes).
  const standalone = useSyncExternalStore(noSubscribe, isStandalone, () => true);
  const ios = useSyncExternalStore(noSubscribe, isIos, () => false);
  const installed = standalone || justInstalled;

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => { setJustInstalled(true); setPrompt(null); toast.success("Installed - open \"S&S Orders\" from your home screen."); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed || (!prompt && !ios)) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setPrompt(null);
      return;
    }
    toast("Install on iPhone / iPad", {
      description: "In Safari, tap the Share button, then \"Add to Home Screen\". Open S&S Orders from the home screen icon.",
      duration: 12_000,
    });
  }

  return (
    <button onClick={install} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-muted">
      <Download className="size-4" /> <span className="hidden sm:inline">Install app</span>
    </button>
  );
}
