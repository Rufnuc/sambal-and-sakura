// A friend's referral code from a /?ref=CODE link, remembered in this browser for 30 days so it's
// still there when they sign up later. Only a convenience: the server re-checks everything.
const KEY = "ss_ref";
const DAYS = 30;
export const REF_PATTERN = /^[A-Z0-9-]{4,20}$/;

export function storeRef(code: string): void {
  const c = code.toUpperCase().trim();
  if (!REF_PATTERN.test(c)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ code: c, at: Date.now() })); } catch { /* private mode */ }
}

export function storedRef(): string {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code?: string; at?: number } | null;
    if (v?.code && v.at && Date.now() - v.at < DAYS * 86_400_000 && REF_PATTERN.test(v.code)) return v.code;
  } catch { /* ignore */ }
  return "";
}

export function clearRef(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
