"use client";

import { reopenConsent } from "@/lib/consent";

/** Footer link that reopens the cookie banner so visitors can change their choice at any time. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return <button type="button" onClick={reopenConsent} className={className}>Cookie settings</button>;
}
