"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, Send, Search, X, Languages, ImagePlus, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/admin/ui";
import { fetchCampaigns, createCampaign, sendCampaignTest, cancelCampaign, translateCampaign, fetchCustomers, uploadImage, uploadCampaignFile, type CampaignRow, type AdminCustomer, type CampaignMediaInput } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = { queued: "Waiting to send", sending: "Sending", sent: "Sent", cancelled: "Stopped" };
type Lang = "en" | "zh" | "vi" | "ja";
const LANGS: { id: Lang; label: string }[] = [{ id: "en", label: "English" }, { id: "zh", label: "中文" }, { id: "vi", label: "Tiếng Việt" }, { id: "ja", label: "日本語" }];
const EMPTY = { subject: "", body: "" };

/**
 * Owner tool: email an offer to every customer who said yes to offers, or to chosen customers.
 * Only customers who opted in can be picked (UK law); each email has an unsubscribe link.
 */
export function EmailCampaigns() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof fetchCampaigns>>>(null);
  // One version per language. Customers get the version in the language they use on the site;
  // if a version is left empty they get the English one.
  const [versions, setVersions] = useState<Record<Lang, { subject: string; body: string }>>({ en: EMPTY, zh: EMPTY, vi: EMPTY, ja: EMPTY });
  const [lang, setLang] = useState<Lang>("en");
  const { subject, body } = versions.en;
  const cur = versions[lang];
  const setCur = (patch: Partial<{ subject: string; body: string }>) => setVersions((v) => ({ ...v, [lang]: { ...v[lang], ...patch } }));
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [picked, setPicked] = useState<Map<string, string>>(new Map()); // id → name
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminCustomer[]>([]);
  const [busy, setBusy] = useState(false);
  // Optional picture (shown in the email) and PDF (opened with a button) - the same for every language.
  const [media, setMedia] = useState<CampaignMediaInput>({});
  const [uploading, setUploading] = useState<"image" | "file" | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  async function addImage(f: File | undefined) {
    if (!f) return;
    setUploading("image");
    const r = await uploadImage(f, "campaign");
    setUploading(null);
    if (r.ok && r.url) setMedia((m) => ({ ...m, imageUrl: r.url })); else toast.error(r.error ?? "Upload failed.");
  }
  async function addFile(f: File | undefined) {
    if (!f) return;
    setUploading("file");
    const r = await uploadCampaignFile(f);
    setUploading(null);
    if (r.ok && r.url) setMedia((m) => ({ ...m, fileUrl: r.url, fileName: m.fileName || f.name.replace(/\.pdf$/i, "") })); else toast.error(r.error ?? "Upload failed.");
  }

  const load = useCallback(() => fetchCampaigns().then(setInfo), []);
  useEffect(() => {
    void load();
    const id = setInterval(load, 20_000); // show sending progress
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (audience !== "selected") return;
    const t = setTimeout(() => fetchCustomers(query.trim(), 0, true).then((r) => setResults(r.customers)), 300);
    return () => clearTimeout(t);
  }, [audience, query]);

  const recipients = audience === "all" ? info?.optedIn ?? 0 : picked.size;
  const ready = subject.trim().length >= 3 && body.trim().length >= 10 && recipients > 0 && !!info?.configured;

  async function send() {
    if (!window.confirm(`Send "${subject.trim()}" to ${recipients} customer${recipients === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    const translations = Object.fromEntries((["zh", "vi", "ja"] as const).filter((l) => versions[l].subject.trim() && versions[l].body.trim()).map((l) => [l, { subject: versions[l].subject.trim(), body: versions[l].body.trim() }]));
    const r = await createCampaign({ subject: subject.trim(), body: body.trim(), translations, audience, userIds: audience === "selected" ? [...picked.keys()] : undefined, ...media });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Queued - it sends in batches over the next few minutes.");
    setVersions({ en: EMPTY, zh: EMPTY, vi: EMPTY, ja: EMPTY }); setLang("en"); setPicked(new Map()); setMedia({});
    void load();
  }
  async function autoTranslate() {
    if (lang === "en") return;
    setBusy(true);
    const r = await translateCampaign({ locale: lang, subject: subject.trim(), body: body.trim() });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setCur({ subject: String(r.subject), body: String(r.body) });
    toast.success("Translated - please have it checked before sending.");
  }
  async function test() {
    setBusy(true);
    const r = await sendCampaignTest({ subject: (cur.subject || subject).trim(), body: (cur.body || body).trim(), locale: cur.subject && cur.body ? lang : "en", ...media });
    setBusy(false);
    if (r.ok) toast.success(`Test sent to ${String(r.to)}`); else toast.error(r.error);
  }

  return (
    <SectionCard title="Email customers" action={<Mail className="size-5 text-gold-ink" />}>
      {!info?.configured && (
        <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Email isn&apos;t switched on yet: add the Brevo key in the server settings (see DEPLOY.md).</p>
      )}
      <p className="text-sm text-muted-foreground">
        Goes only to customers who said yes to offers ({info?.optedIn ?? 0} right now). Every email has an unsubscribe link.
        Up to {info?.allowanceToday ?? 0} more promotional emails can go today; the rest continue tomorrow, so order emails are never held up.
      </p>

      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
          {LANGS.map((l) => (
            <button key={l.id} type="button" onClick={() => setLang(l.id)} className={cn("rounded-md px-3 py-1.5 text-sm transition", lang === l.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
              <span className="notranslate" translate="no">{l.label}</span>{l.id !== "en" && versions[l.id].subject && versions[l.id].body ? " ✓" : ""}
            </button>
          ))}
        </div>
        {lang !== "en" && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Optional. Customers using this language get this version; leave it empty to send them the English one.</span>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1" disabled={busy || subject.trim().length < 3 || body.trim().length < 10} onClick={autoTranslate}><Languages className="size-3.5" /> Auto-translate from English</Button>
          </div>
        )}
        <div><Label htmlFor="cm-subject">Subject</Label><Input id="cm-subject" value={cur.subject} onChange={(e) => setCur({ subject: e.target.value })} maxLength={150} className="mt-1.5 h-10 notranslate" translate="no" placeholder={lang === "en" ? "e.g. 20% off this weekend" : "Subject in this language"} /></div>
        <div>
          <Label htmlFor="cm-body">Message</Label>
          <Textarea id="cm-body" value={cur.body} onChange={(e) => setCur({ body: e.target.value })} maxLength={5000} className="mt-1.5 min-h-32 notranslate" translate="no" placeholder={"Write it like a normal email. Leave a blank line between paragraphs.\nThe greeting, an \"Order now\" button and the unsubscribe link are added for you (in each customer's language)."} />
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Picture and file <span className="font-normal text-muted-foreground">(optional, same for every language)</span></p>
          <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { void addFile(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              {media.imageUrl ? (
                <div className="relative overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={media.imageUrl} alt="Email picture" className="max-h-40 w-full object-cover" />
                  <button aria-label="Remove picture" onClick={() => setMedia((m) => ({ ...m, imageUrl: null }))} className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-background/90 shadow"><X className="size-4" /></button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="h-10 w-full gap-1.5" disabled={uploading !== null} onClick={() => imageRef.current?.click()}>
                  <ImagePlus className="size-4" /> {uploading === "image" ? "Uploading…" : "Add a picture"}
                </Button>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Shown at the top of the email. JPG or PNG.</p>
            </div>
            <div>
              {media.fileUrl ? (
                <div className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <FileText className="size-5 shrink-0 text-gold-ink" />
                  <Input value={media.fileName ?? ""} onChange={(e) => setMedia((m) => ({ ...m, fileName: e.target.value }))} maxLength={80} aria-label="Button text for the file" className="h-8" />
                  <button aria-label="Remove file" onClick={() => setMedia((m) => ({ ...m, fileUrl: null, fileName: null }))} className="flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-muted"><X className="size-4" /></button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="h-10 w-full gap-1.5" disabled={uploading !== null} onClick={() => fileRef.current?.click()}>
                  <FileText className="size-4" /> {uploading === "file" ? "Uploading…" : "Add a PDF (menu, flyer)"}
                </Button>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Customers open it with a button in the email (not attached, so it isn&apos;t caught by spam filters). Up to 10 MB.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["all", "selected"] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAudience(a)} className={cn("rounded-full border px-4 py-1.5 text-sm transition", audience === a ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>
              {a === "all" ? `Everyone who opted in (${info?.optedIn ?? 0})` : `Choose customers${picked.size ? ` (${picked.size})` : ""}`}
            </button>
          ))}
        </div>

        {audience === "selected" && (
          <div className="rounded-lg border border-border p-3">
            {picked.size > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[...picked].map(([id, name]) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                    {name}<button aria-label={`Remove ${name}`} onClick={() => setPicked((p) => { const n = new Map(p); n.delete(id); return n; })}><X className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search opted-in customers" className="h-9 pl-8" />
            </div>
            <ul className="mt-2 max-h-48 divide-y divide-border overflow-y-auto text-sm">
              {results.length === 0 && <li className="py-2 text-muted-foreground">No opted-in customers match.</li>}
              {results.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 py-1.5">
                    <input type="checkbox" checked={picked.has(c.id)} onChange={(e) => setPicked((p) => { const n = new Map(p); if (e.target.checked) n.set(c.id, c.name); else n.delete(c.id); return n; })} />
                    <span className="font-medium">{c.name}</span><span className="text-muted-foreground">{c.email}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10" disabled={busy || subject.trim().length < 3 || body.trim().length < 10 || !info?.configured} onClick={test}>Send me a test{lang !== "en" && cur.subject && cur.body ? ` (${LANGS.find((l) => l.id === lang)?.label})` : ""}</Button>
          <Button className="h-10 gap-1.5" disabled={busy || !ready} onClick={send}><Send className="size-4" /> Send to {recipients} customer{recipients === 1 ? "" : "s"}</Button>
        </div>
      </div>

      {!!info?.campaigns.length && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">Recent emails</p>
          <ul className="divide-y divide-border text-sm">
            {info.campaigns.map((c: CampaignRow) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {STATUS[c.status] ?? c.status} · {c.sent}/{c.total} sent{c.failed ? ` · ${c.failed} failed` : ""}
                  </p>
                </div>
                {(c.status === "queued" || c.status === "sending") && (
                  <Button size="sm" variant="ghost" className="h-8 text-sambal" onClick={async () => { const r = await cancelCampaign(c.id); if (r.ok) { toast("Stopped"); void load(); } else toast.error(r.error); }}>Stop</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
