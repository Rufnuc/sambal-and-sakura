"use client";

import { create } from "zustand";

// Client auth cache. The real session is an httpOnly cookie set by the API;
// this store just mirrors the signed-in user for the UI, hydrated via /api/auth/me.

export interface Reward {
  id: string; label: string; code: string;
  kind: "percent" | "voucher" | "freebie";
  amount?: number | null; source: string; used: boolean;
  createdAt: string; expiresAt: string;
  active?: boolean; // usable right now (not used, not expired, campaign not ended)
}
export interface Account {
  id: string; name: string; email: string; phone: string;
  role: string; points: number; referralCode: string; createdAt: string;
  pendingPoints?: number; // earned on orders not completed yet (not spendable)
  marketingOptIn?: boolean;
}

export const LOYALTY = {
  pointsPerPound: 10,
  redeemStep: 100,
  redeemValue: 5,
  tiers: [
    { name: "Bronze", min: 0 },
    { name: "Silver", min: 500 },
    { name: "Gold", min: 1500 },
    { name: "Jade", min: 3000 },
  ],
};

export function tierFor(points: number) {
  let current = LOYALTY.tiers[0];
  let next: (typeof LOYALTY.tiers)[number] | null = null;
  for (let i = 0; i < LOYALTY.tiers.length; i++) {
    if (points >= LOYALTY.tiers[i].min) current = LOYALTY.tiers[i];
    else { next = LOYALTY.tiers[i]; break; }
  }
  return { current, next };
}

type Result = { ok: boolean; error?: string; deactivated?: boolean; reactivateBy?: string };

interface AuthState {
  user: Account | null;
  rewards: Reward[];
  loaded: boolean;
  refresh: () => Promise<void>;
  register: (name: string, email: string, phone: string, password: string, turnstileToken?: string, marketingOptIn?: boolean, locale?: string, referralCode?: string) => Promise<Result>;
  login: (email: string, password: string) => Promise<Result>;
  reactivate: (email: string, password: string) => Promise<Result>;
  logout: (everywhere?: boolean) => Promise<void>;
  redeemPoints: () => Promise<Result>;
  updateProfile: (patch: { name?: string; phone?: string; marketingOptIn?: boolean }) => Promise<Result>;
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export const useAuth = create<AuthState>()((set, get) => ({
  user: null,
  rewards: [],
  loaded: false,

  refresh: async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      set({ user: data.user ?? null, rewards: data.rewards ?? [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  register: async (name, email, phone, password, turnstileToken, marketingOptIn = false, locale = "en", referralCode) => {
    const { res, data } = await postJson("/api/auth/register", { name, email, phone, password, marketingOptIn, locale, turnstileToken: turnstileToken || undefined, referralCode: referralCode?.trim() || undefined });
    if (!res.ok) return { ok: false, error: data.error };
    await get().refresh();
    return { ok: true };
  },

  login: async (email, password) => {
    const { res, data } = await postJson("/api/auth/login", { email, password });
    if (!res.ok) return { ok: false, error: data.error, deactivated: !!data.deactivated, reactivateBy: data.reactivateBy };
    await get().refresh();
    return { ok: true };
  },

  reactivate: async (email, password) => {
    const { res, data } = await postJson("/api/account/reactivate", { email, password });
    if (!res.ok) return { ok: false, error: data.error };
    await get().refresh();
    return { ok: true };
  },

  logout: async (everywhere = false) => {
    await fetch(`/api/auth/logout${everywhere ? "?all=1" : ""}`, { method: "POST" });
    set({ user: null, rewards: [] });
  },

  redeemPoints: async () => {
    const { res, data } = await postJson("/api/rewards/redeem");
    if (!res.ok) return { ok: false, error: data.error };
    await get().refresh();
    return { ok: true };
  },

  updateProfile: async (patch) => {
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error };
    set({ user: data.user });
    return { ok: true };
  },
}));
