"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Plus, Trash2, ArrowUp, ArrowDown, TriangleAlert, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/ui";
import { fetchConfig, saveSite } from "@/lib/admin/api";
import { DEFAULT_SITE_CONTENT, VALUE_ICONS, FAQ_GROUPS, type SiteContent, type SocialKey } from "@/lib/site-content";
import type { DayHours } from "@/lib/data/site";
import { cn } from "@/lib/utils";
import { HeroImagesEditor, SignatureEditor } from "@/components/admin/home-dishes-editor";

const TABS = [
  { id: "business", label: "Business details" },
  { id: "hours", label: "Opening hours" },
  { id: "home", label: "Home page" },
  { id: "reviews", label: "Reviews" },
  { id: "faq", label: "FAQ" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const GROUP_LABELS: Record<string, string> = {
  ordering: "Ordering", delivery: "Delivery", booking: "Booking", payment: "Payment", allergens: "Allergens & diets", policies: "Policies",
};
// Show Monday first; data index 0 = Sunday.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SAMPLE_REVIEW_IDS = new Set(DEFAULT_SITE_CONTENT.reviews.items.map((r) => r.id));

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function ContentView() {
  const [c, setC] = useState<SiteContent | null>(null);
  const [saved, setSaved] = useState<SiteContent | null>(null); // last version stored on the server
  const [version, setVersion] = useState("");                     // fingerprint of that stored version
  const [stale, setStale] = useState(false);                      // someone else saved since this page loaded
  const [tab, setTab] = useState<TabId>("business");
  const [saving, setSaving] = useState(false);
  const [menuPhotos, setMenuPhotos] = useState<Record<string, string | undefined>>({}); // dish photos from Admin → Menu

  function load() {
    return fetchConfig().then((cfg) => {
      setC(cfg.site); setSaved(cfg.site); setVersion(cfg.siteVersion); setStale(false);
      setMenuPhotos(Object.fromEntries(Object.entries(cfg.menuOverrides).map(([id, o]) => [id, o.image])));
    });
  }
  useEffect(() => { load(); }, []);

  // Edits only reach the website when saved, so make "not saved yet" impossible to miss.
  const dirty = useMemo(() => !!c && !!saved && JSON.stringify(c) !== JSON.stringify(saved), [c, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!c) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const set = (patch: Partial<SiteContent>) => setC((prev) => (prev ? { ...prev, ...patch } : prev));
  const setBusiness = (patch: Partial<SiteContent["business"]>) => set({ business: { ...c.business, ...patch } });

  async function save() {
    if (!c) return;
    setSaving(true);
    const res = await saveSite(c, version);
    setSaving(false);
    if (res.ok) { setC(res.site); setSaved(res.site); setVersion(res.version); setStale(false); toast.success("Saved - the website is updated"); }
    else { if (res.conflict) setStale(true); toast.error(res.error, { duration: 8000 }); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Site content</h1>
          <p className="text-muted-foreground">Edit what customers read on the website. <strong className="font-semibold text-foreground">Changes only go live when you press Save.</strong></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10 gap-1.5" render={<a href="/" target="_blank" rel="noopener noreferrer" />}>
            <ExternalLink className="size-4" /> View site
          </Button>
          <Button className="h-10 gap-1.5" onClick={save} disabled={saving}><Save className="size-4" /> {saving ? "Saving…" : dirty ? "Save changes" : "Save all"}</Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition", tab === t.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "business" && <BusinessTab c={c} setBusiness={setBusiness} />}
      {tab === "hours" && <HoursTab hours={c.business.hours} onChange={(hours) => setBusiness({ hours })} />}
      {tab === "home" && <HomeTab c={c} set={set} menuPhotos={menuPhotos} />}
      {tab === "reviews" && <ReviewsTab c={c} set={set} />}
      {tab === "faq" && <FaqTab c={c} set={set} />}

      {dirty && (
        <div role="status" className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-card p-3 pl-4 shadow-lg">
          {stale ? (
            <>
              <p className="text-sm"><strong className="font-semibold text-sambal">This page is out of date.</strong> <span className="text-muted-foreground">The content was changed somewhere else, so your save was blocked to avoid undoing it. Reload the latest, then make your change again.</span></p>
              <Button className="h-10" onClick={() => load()}>Reload latest</Button>
            </>
          ) : (
            <>
              <p className="text-sm"><strong className="font-semibold">You have unsaved changes.</strong> <span className="text-muted-foreground">The website won&apos;t change until you save.</span></p>
              <div className="flex gap-2">
                <Button variant="outline" className="h-10" onClick={() => setC(saved)} disabled={saving}>Discard</Button>
                <Button className="h-10 gap-1.5" onClick={save} disabled={saving}><Save className="size-4" /> {saving ? "Saving…" : "Save changes"}</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- Business */
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const SOCIAL_FIELDS: { key: SocialKey; label: string; example: string }[] = [
  { key: "instagram", label: "Instagram link", example: "https://instagram.com/…" },
  { key: "tiktok", label: "TikTok link", example: "https://tiktok.com/@…" },
  { key: "facebook", label: "Facebook link", example: "https://facebook.com/…" },
  { key: "rednote", label: "RedNote (Xiaohongshu) link", example: "https://www.xiaohongshu.com/user/profile/…" },
  { key: "wechat", label: "WeChat ID", example: "Your WeChat ID" },
];

function BusinessTab({ c, setBusiness }: { c: SiteContent; setBusiness: (p: Partial<SiteContent["business"]>) => void }) {
  const b = c.business;
  const setAddr = (p: Partial<typeof b.address>) => setBusiness({ address: { ...b.address, ...p } });
  const setSocial = (p: Partial<typeof b.social>) => setBusiness({ social: { ...b.social, ...p } });
  const setShow = (p: Partial<typeof b.socialShow>) => setBusiness({ socialShow: { ...b.socialShow, ...p } });
  return (
    <>
      <SectionCard title="Contact & address">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone"><Input value={b.phone} onChange={(e) => setBusiness({ phone: e.target.value })} className="h-10" inputMode="tel" /></Field>
          <Field label="Email"><Input value={b.email} onChange={(e) => setBusiness({ email: e.target.value })} className="h-10" inputMode="email" /></Field>
          <Field label="Address line 1"><Input value={b.address.line1} onChange={(e) => setAddr({ line1: e.target.value })} className="h-10" /></Field>
          <Field label="Address line 2 (optional)"><Input value={b.address.line2} onChange={(e) => setAddr({ line2: e.target.value })} className="h-10" /></Field>
          <Field label="Town / city"><Input value={b.address.city} onChange={(e) => setAddr({ city: e.target.value })} className="h-10" /></Field>
          <Field label="Postcode"><Input value={b.address.postcode} onChange={(e) => setAddr({ postcode: e.target.value })} className="h-10" /></Field>
          <div className="sm:col-span-2">
            <Field label="Map search text" hint="What Google Maps searches for, e.g. the full address."><Input value={b.mapQuery} onChange={(e) => setBusiness({ mapQuery: e.target.value })} className="h-10" /></Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Google reviews (NFC card / QR code)">
        <div className="grid gap-3">
          <Field label="Your Google review link" hint='From business.google.com: open your profile → "Ask for reviews" → copy the link (it starts with https://g.page/ or https://www.google.com/).'>
            <Input value={b.googleReviewUrl} onChange={(e) => setBusiness({ googleReviewUrl: e.target.value })} className="h-10" placeholder="https://g.page/r/…/review" inputMode="url" />
          </Field>
          <p className="rounded-lg bg-muted/60 p-3 text-sm">
            <strong className="font-semibold">Put this address on your NFC card and QR code:</strong>{" "}
            <code className="break-all rounded bg-background px-1.5 py-0.5">{typeof window !== "undefined" ? window.location.origin : ""}/review</code>
            <span className="mt-1 block text-muted-foreground">It forwards to the link above, so you can change the link later without reprogramming any card. Leave the link empty and it goes to the Contact page instead.</span>
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Tagline & description">
        <div className="grid grid-cols-1 gap-3">
          <Field label="Tagline" hint="Shown in the browser tab and search results."><Input value={b.tagline} onChange={(e) => setBusiness({ tagline: e.target.value })} className="h-10" /></Field>
          <Field label="Short description" hint="Shown on the home page, footer and Google search results."><Textarea value={b.blurb} onChange={(e) => setBusiness({ blurb: e.target.value })} rows={3} /></Field>
        </div>
      </SectionCard>

      <SectionCard title="Social media">
        <p className="mb-3 text-sm text-muted-foreground">Add the link to each profile, check it opens the right page, then switch it on. Only switched-on profiles appear on the website and in Google&apos;s business information.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((f) => {
            const on = b.socialShow[f.key];
            const value = b.social[f.key];
            return (
              <Field key={f.key} label={f.label}>
                <div className="flex items-center gap-2">
                  <Input value={value} onChange={(e) => setSocial({ [f.key]: e.target.value })} className="h-10" placeholder={f.example} inputMode={f.key === "wechat" ? "text" : "url"} />
                  <button type="button" onClick={() => setShow({ [f.key]: !on })} disabled={!value.trim() && !on} role="switch" aria-checked={on} aria-label={`Show ${f.label} on the website`} title={on ? "Shown on the website" : "Hidden"}
                    className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-40", on ? "bg-jade" : "bg-muted")}>
                    <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", on ? "translate-x-6" : "translate-x-1")} />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{on ? "Shown on the website" : "Hidden"}</p>
              </Field>
            );
          })}
        </div>
      </SectionCard>
    </>
  );
}

/* -------------------------------------------------------------- Hours */
function HoursTab({ hours, onChange }: { hours: DayHours[]; onChange: (h: DayHours[]) => void }) {
  const setDay = (idx: number, patch: Partial<DayHours>) => onChange(hours.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  return (
    <SectionCard title="Opening hours">
      <p className="mb-4 text-sm text-muted-foreground">
        These drive the "Open now" badge, the hours shown on the site, Google, <strong>and the times customers can book online</strong>. Use 24-hour times. Add a second session for a split lunch / dinner service.
      </p>
      <div className="flex flex-col gap-3">
        {DAY_ORDER.map((idx) => {
          const d = hours[idx];
          const closed = d.sessions.length === 0;
          return (
            <div key={d.day} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <span className="w-12 font-semibold">{d.day}</span>
              <button
                role="switch" aria-checked={!closed} aria-label={`${d.day} open`}
                onClick={() => setDay(idx, { sessions: closed ? [{ open: "11:30", close: "22:00" }] : [] })}
                className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition", closed ? "bg-muted" : "bg-jade")}
              >
                <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", closed ? "translate-x-1" : "translate-x-6")} />
              </button>
              {closed ? <span className="text-sm text-muted-foreground">Closed</span> : (
                <div className="flex flex-wrap items-center gap-2">
                  {d.sessions.map((s, si) => (
                    <div key={si} className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2 py-1">
                      <Input type="time" value={s.open} onChange={(e) => setDay(idx, { sessions: d.sessions.map((x, i) => (i === si ? { ...x, open: e.target.value } : x)) })} className="h-9 w-28" />
                      <span className="text-muted-foreground">to</span>
                      <Input type="time" value={s.close} onChange={(e) => setDay(idx, { sessions: d.sessions.map((x, i) => (i === si ? { ...x, close: e.target.value } : x)) })} className="h-9 w-28" />
                      {d.sessions.length > 1 && (
                        <button aria-label="Remove session" onClick={() => setDay(idx, { sessions: d.sessions.filter((_, i) => i !== si) })} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-sambal"><Trash2 className="size-4" /></button>
                      )}
                    </div>
                  ))}
                  {d.sessions.length < 3 && (
                    <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => setDay(idx, { sessions: [...d.sessions, { open: "17:00", close: "22:00" }] })}><Plus className="size-4" /> Session</Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* --------------------------------------------------------------- Home */
function HomeTab({ c, set, menuPhotos }: { c: SiteContent; set: (p: Partial<SiteContent>) => void; menuPhotos: Record<string, string | undefined> }) {
  const setHero = (p: Partial<SiteContent["hero"]>) => set({ hero: { ...c.hero, ...p } });
  const setCta = (p: Partial<SiteContent["cta"]>) => set({ cta: { ...c.cta, ...p } });
  const setItem = (i: number, p: Partial<SiteContent["valueStrip"][number]>) => set({ valueStrip: c.valueStrip.map((v, idx) => (idx === i ? { ...v, ...p } : v)) });
  return (
    <>
      <SectionCard title="Top banner (hero)">
        <div className="grid grid-cols-1 gap-3">
          <Field label="Small badge above the headline"><Input value={c.hero.badge} onChange={(e) => setHero({ badge: e.target.value })} className="h-10" /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Headline - start"><Input value={c.hero.headlineStart} onChange={(e) => setHero({ headlineStart: e.target.value })} className="h-10" /></Field>
            <Field label="Headline - highlighted (gold)"><Input value={c.hero.headlineAccent} onChange={(e) => setHero({ headlineAccent: e.target.value })} className="h-10" /></Field>
            <Field label="Headline - end"><Input value={c.hero.headlineEnd} onChange={(e) => setHero({ headlineEnd: e.target.value })} className="h-10" /></Field>
          </div>
          <p className="text-sm">Preview: <span className="font-display font-bold">{c.hero.headlineStart}<span className="text-gold-ink">{c.hero.headlineAccent}</span>{c.hero.headlineEnd}</span></p>
        </div>
      </SectionCard>

      <SectionCard title="Banner images">
        <HeroImagesEditor hero={c.hero} onChange={setHero} menuPhotos={menuPhotos} />
      </SectionCard>

      <SectionCard title="Signature dishes">
        <SignatureEditor ids={c.signature.dishIds} onChange={(dishIds) => set({ signature: { dishIds } })} />
      </SectionCard>

      <SectionCard
        title="Highlights strip"
        action={<Button variant="outline" size="sm" className="h-9 gap-1" disabled={c.valueStrip.length >= 6} onClick={() => set({ valueStrip: [...c.valueStrip, { icon: "sparkles", title: "New highlight", text: "" }] })}><Plus className="size-4" /> Add</Button>}
      >
        <p className="mb-3 text-sm text-muted-foreground">The row of short selling points under the banner. Up to 6; 4 looks best.</p>
        <DeliveryTokensHint />
        <div className="flex flex-col gap-3">
          {c.valueStrip.map((v, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-border p-3 sm:grid-cols-[8rem_1fr_2fr_auto] sm:items-end">
              <Field label="Icon">
                <select value={v.icon} onChange={(e) => setItem(i, { icon: e.target.value as typeof v.icon })} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm capitalize">
                  {VALUE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
              </Field>
              <Field label="Title"><Input value={v.title} onChange={(e) => setItem(i, { title: e.target.value })} className="h-10" /></Field>
              <Field label="Text"><Input value={v.text} onChange={(e) => setItem(i, { text: e.target.value })} className="h-10" /></Field>
              <RowActions onUp={() => set({ valueStrip: move(c.valueStrip, i, -1) })} onDown={() => set({ valueStrip: move(c.valueStrip, i, 1) })} onDelete={() => set({ valueStrip: c.valueStrip.filter((_, idx) => idx !== i) })} />
            </div>
          ))}
          {c.valueStrip.length === 0 && <p className="text-sm text-muted-foreground">No highlights - the strip is hidden.</p>}
        </div>
      </SectionCard>

      <SectionCard title="Bottom banner">
        <div className="grid grid-cols-1 gap-3">
          <Field label="Heading"><Input value={c.cta.heading} onChange={(e) => setCta({ heading: e.target.value })} className="h-10" /></Field>
          <Field label="Text underneath (optional)"><Input value={c.cta.subtext} onChange={(e) => setCta({ subtext: e.target.value })} className="h-10" /></Field>
        </div>
      </SectionCard>
    </>
  );
}

/* ------------------------------------------------------------ Reviews */
function ReviewsTab({ c, set }: { c: SiteContent; set: (p: Partial<SiteContent>) => void }) {
  const r = c.reviews;
  const setR = (p: Partial<typeof r>) => set({ reviews: { ...r, ...p } });
  const setItem = (i: number, p: Partial<(typeof r.items)[number]>) => setR({ items: r.items.map((x, idx) => (idx === i ? { ...x, ...p } : x)) });
  const hasSamples = r.items.some((x) => SAMPLE_REVIEW_IDS.has(x.id));
  return (
    <>
      {hasSamples && (
        <div className="flex items-start gap-3 rounded-xl border border-sambal/30 bg-sambal/10 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-sambal" />
          <p>
            <strong>Sample reviews detected.</strong> These were written as placeholders and are not from real customers. Before launch, replace them with genuine reviews (with permission) or switch <em>Show reviews</em> off. Publishing invented reviews can breach UK consumer law.
          </p>
        </div>
      )}
      <SectionCard
        title="Reviews section"
        action={<Button variant="outline" size="sm" className="h-9 gap-1" disabled={r.items.length >= 24} onClick={() => setR({ items: [...r.items, { id: "r" + Date.now().toString(36), name: "", rating: 5, text: "", dish: "", source: "Google", date: new Date().toISOString().slice(0, 10) }] })}><Plus className="size-4" /> Add review</Button>}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => {
            if (!r.show && !window.confirm("Only show reviews written by real customers who agreed to be quoted. Invented or edited reviews are illegal under UK consumer law. Show reviews?")) return;
            setR({ show: !r.show });
          }} role="switch" aria-checked={r.show} aria-label="Show reviews" className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition", r.show ? "bg-jade" : "bg-muted")}>
            <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", r.show ? "translate-x-6" : "translate-x-1")} />
          </button>
          <span className="text-sm text-muted-foreground">{r.show ? "Reviews are shown on the home page" : "Reviews will be hidden once you press Save (also removes the star rating from the home page and Google)"}</span>
        </div>
        <div className="mt-3 max-w-md"><Field label="Where they're from (shown next to the rating)"><Input value={r.sourceNote} onChange={(e) => setR({ sourceNote: e.target.value })} className="h-10" placeholder="across Google & TripAdvisor" /></Field></div>
      </SectionCard>

      <div className="flex flex-col gap-3">
        {r.items.map((it, i) => (
          <SectionCard key={it.id}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_6rem_1fr_1fr_auto] sm:items-end">
              <Field label="Customer name"><Input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} className="h-10" /></Field>
              <Field label="Stars">
                <select value={it.rating} onChange={(e) => setItem(i, { rating: Number(e.target.value) })} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Dish they mention (optional)"><Input value={it.dish ?? ""} onChange={(e) => setItem(i, { dish: e.target.value })} className="h-10" /></Field>
              <Field label="Source"><Input value={it.source} onChange={(e) => setItem(i, { source: e.target.value })} className="h-10" /></Field>
              <RowActions onUp={() => setR({ items: move(r.items, i, -1) })} onDown={() => setR({ items: move(r.items, i, 1) })} onDelete={() => setR({ items: r.items.filter((_, idx) => idx !== i) })} />
            </div>
            <div className="mt-3"><Field label="Review text"><Textarea value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} rows={2} /></Field></div>
          </SectionCard>
        ))}
        {r.items.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- FAQ */
function FaqTab({ c, set }: { c: SiteContent; set: (p: Partial<SiteContent>) => void }) {
  const setItem = (i: number, p: Partial<SiteContent["faqs"][number]>) => set({ faqs: c.faqs.map((f, idx) => (idx === i ? { ...f, ...p } : f)) });
  return (
    <SectionCard
      title={`Frequently asked questions (${c.faqs.length})`}
      action={<Button variant="outline" size="sm" className="h-9 gap-1" disabled={c.faqs.length >= 60} onClick={() => set({ faqs: [...c.faqs, { q: "", a: "", group: "ordering" }] })}><Plus className="size-4" /> Add question</Button>}
    >
      <p className="mb-3 text-sm text-muted-foreground">Shown at the bottom of the Contact page, grouped by topic, and offered to Google as rich answers.</p>
      <DeliveryTokensHint />
      <div className="flex flex-col gap-3">
        {c.faqs.map((f, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
              <Field label="Topic">
                <select value={f.group} onChange={(e) => setItem(i, { group: e.target.value as typeof f.group })} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  {FAQ_GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
                </select>
              </Field>
              <Field label="Question"><Input value={f.q} onChange={(e) => setItem(i, { q: e.target.value })} className="h-10" /></Field>
              <RowActions onUp={() => set({ faqs: move(c.faqs, i, -1) })} onDown={() => set({ faqs: move(c.faqs, i, 1) })} onDelete={() => set({ faqs: c.faqs.filter((_, idx) => idx !== i) })} />
            </div>
            <div className="mt-2"><Field label="Answer"><Textarea value={f.a} onChange={(e) => setItem(i, { a: e.target.value })} rows={2} /></Field></div>
          </div>
        ))}
        {c.faqs.length === 0 && <p className="text-sm text-muted-foreground">No questions - the FAQ page will be empty.</p>}
      </div>
    </SectionCard>
  );
}

function RowActions({ onUp, onDown, onDelete }: { onUp: () => void; onDown: () => void; onDelete: () => void }) {
  const btn = "flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="flex items-center gap-0.5">
      <button aria-label="Move up" onClick={onUp} className={btn}><ArrowUp className="size-4" /></button>
      <button aria-label="Move down" onClick={onDown} className={btn}><ArrowDown className="size-4" /></button>
      <button aria-label="Remove" onClick={onDelete} className={cn(btn, "hover:text-sambal")}><Trash2 className="size-4" /></button>
    </div>
  );
}

/** Placeholders the site fills in from Settings -> Delivery prices (see src/server/live-content.ts). */
function DeliveryTokensHint() {
  return (
    <p className="mb-3 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
      Prices stay up to date if you type these instead of amounts: <code>{"{deliveryTitle}"}</code> (e.g. &quot;Free delivery on £25+&quot;),{" "}
      <code>{"{deliveryLine}"}</code> (e.g. &quot;Delivery from £1.99, free on £25 or more. £12 minimum.&quot;), <code>{"{freeOver}"}</code>,{" "}
      <code>{"{deliveryFrom}"}</code>, <code>{"{deliveryRange}"}</code> and <code>{"{minOrder}"}</code>. They follow Settings → Delivery prices.
    </p>
  );
}
