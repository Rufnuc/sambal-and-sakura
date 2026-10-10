"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Flame, Leaf, Pencil, Upload, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { DishImage } from "@/components/brand/dish-image";
import { realPhoto } from "@/components/menu/dish-card";
import { MENU, CATEGORY_LABELS, type MenuCategory, type MenuItem } from "@/lib/data/menu";
import { saveConfig, uploadImage, fetchMenuAvailability, setSoldOut, type AdminConfig, type MenuOverrideCfg } from "@/lib/admin/api";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Overrides = AdminConfig["menuOverrides"];
const CATS = Object.keys(CATEGORY_LABELS) as MenuCategory[];

export function MenuView() {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<MenuCategory | "all">("all");
  const [sort, setSort] = useState<"default" | "price-asc" | "price-desc" | "name">("default");
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [canEdit, setCanEdit] = useState(false); // owner: full edits; staff: sold-out switch only

  useEffect(() => { fetchMenuAvailability().then((r) => { setOverrides(r?.menuOverrides ?? {}); setCanEdit(!!r?.canEdit); setReady(true); }); }, []);

  function effective(m: MenuItem): MenuItem {
    const o = overrides[m.id];
    if (!o) return m;
    return {
      ...m,
      name: o.name ?? m.name,
      description: o.description ?? m.description,
      price: typeof o.price === "number" ? o.price : m.price,
      soldOut: typeof o.soldOut === "boolean" ? o.soldOut : m.soldOut,
      image: o.image ?? m.image,
      category: (o.category as MenuCategory) ?? m.category,
      leadTimeHours: typeof o.leadTimeHours === "number" ? o.leadTimeHours : m.leadTimeHours,
      aiNotes: o.aiNotes ?? m.aiNotes,
    };
  }

  async function persist(next: Overrides): Promise<boolean> {
    const before = overrides;
    setOverrides(next);
    try {
      const c = await saveConfig({ menuOverrides: next });
      setOverrides(c.menuOverrides ?? next);
      return true;
    } catch (e) {
      setOverrides(before);
      toast.error((e as Error).message);
      return false;
    }
  }
  async function toggleSoldOut(m: MenuItem) {
    const eff = effective(m);
    const next = await setSoldOut(m.id, !eff.soldOut);
    if (!next) { toast.error("Could not update. Check your connection."); return; }
    setOverrides(next);
    toast.success(`${eff.name} marked ${!eff.soldOut ? "sold out" : "available"}`);
  }
  async function saveEdit(id: string, patch: MenuOverrideCfg) {
    const base = MENU.find((m) => m.id === id)!;
    const o: MenuOverrideCfg = { ...overrides[id] };
    const set = <K extends keyof MenuOverrideCfg>(k: K, v: MenuOverrideCfg[K], baseVal: unknown) => {
      if (v !== undefined && v !== "" && v !== baseVal) o[k] = v; else delete o[k];
    };
    set("name", patch.name?.trim(), base.name);
    set("description", patch.description?.trim(), base.description);
    set("price", Number.isFinite(patch.price) && patch.price !== undefined ? Math.round(patch.price * 100) / 100 : undefined, base.price);
    set("category", patch.category, base.category);
    set("leadTimeHours", typeof patch.leadTimeHours === "number" && patch.leadTimeHours > 0 ? patch.leadTimeHours : undefined, base.leadTimeHours);
    set("aiNotes", patch.aiNotes?.trim(), base.aiNotes);
    set("image", patch.image, base.image);
    if (typeof overrides[id]?.soldOut === "boolean") o.soldOut = overrides[id]!.soldOut; // keep existing sold-out state
    const next = { ...overrides, [id]: o };
    if (Object.keys(o).length === 0) delete next[id];
    if (!(await persist(next))) return; // error already shown; keep the dialog open to fix it
    toast.success("Item updated");
    setEditing(null);
  }

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = MENU.map(effective).filter((m) => (cat === "all" || m.category === cat) && (!q || m.name.toLowerCase().includes(q)));
    if (sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cat, sort, overrides]);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const soldOut = MENU.map(effective).filter((m) => m.soldOut).length;
  const editedCount = Object.keys(overrides).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Menu</h1>
        <p className="text-muted-foreground">{MENU.length} items · {soldOut} sold out · {editedCount} edited</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Live items" value={String(MENU.length - soldOut)} accent="jade" />
        <StatCard label="Sold out" value={String(soldOut)} accent="sambal" />
        <StatCard label="Edited" value={String(editedCount)} accent="gold" />
        <StatCard label="Categories" value={String(CATS.length)} accent="sakura" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search menu…" className="h-11 pl-9" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value as MenuCategory | "all")} className="h-11 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="all">All categories</option>
          {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="default">Default order</option>
          <option value="name">Name A–Z</option>
          <option value="price-asc">Price low–high</option>
          <option value="price-desc">Price high–low</option>
        </select>
      </div>

      <SectionCard>
        <ul className="divide-y divide-border">
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <DishImage name={m.name} category={m.category} className="size-14 shrink-0" rounded="rounded-lg" src={realPhoto(m.image)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{m.name}</p>
                  {m.spiceLevel ? <Flame className="size-3.5 text-sambal" /> : null}
                  {(m.tags.includes("vegetarian") || m.tags.includes("vegan")) && <Leaf className="size-3.5 text-jade" />}
                  {m.leadTimeHours ? <Badge variant="outline" className="gap-1 border-gold/30 bg-gold/10 text-gold-ink"><Clock className="size-3" />{m.leadTimeHours}h</Badge> : null}
                  {realPhoto(m.image) && <Badge variant="outline" className="border-jade/30 bg-jade/10 text-jade">photo</Badge>}
                  {overrides[m.id] && <Badge variant="outline" className="border-gold/30 bg-gold/10 text-gold-ink">edited</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">{CATEGORY_LABELS[m.category]}</p>
              </div>
              <span className="w-16 text-right font-semibold">{gbp(m.price)}</span>
              {canEdit && <Button size="icon-sm" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}><Pencil className="size-4" /></Button>}
              <button onClick={() => toggleSoldOut(m)} role="switch" aria-checked={!m.soldOut} aria-label={`${m.name} availability`} className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition", m.soldOut ? "bg-muted" : "bg-jade")}>
                <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", m.soldOut ? "translate-x-1" : "translate-x-6")} />
              </button>
            </li>
          ))}
        </ul>
        {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No items match.</p>}
      </SectionCard>

      <EditDialog item={editing} onClose={() => setEditing(null)} onSave={saveEdit} />
    </div>
  );
}

function EditDialog({ item, onClose, onSave }: { item: MenuItem | null; onClose: () => void; onSave: (id: string, patch: MenuOverrideCfg) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MenuCategory>("starters");
  const [lead, setLead] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setName(item.name); setPrice(String(item.price)); setDescription(item.description);
      setCategory(item.category); setLead(item.leadTimeHours ? String(item.leadTimeHours) : "");
      setAiNotes(item.aiNotes ?? "");
      setImage(realPhoto(item.image) ?? "");
    }
  }, [item]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadImage(file);
    setUploading(false);
    if (res.ok && res.url) { setImage(res.url); toast.success("Photo uploaded"); }
    else toast.error(res.error ?? "Upload failed.");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        {item && (
          <>
            <DialogHeader><DialogTitle className="font-display">Edit item</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3">
              {/* Photo */}
              <div>
                <Label>Photo</Label>
                <div className="mt-1.5 flex items-center gap-3">
                  <DishImage name={name || item.name} category={category} className="size-20 shrink-0" rounded="rounded-lg" src={image || undefined} />
                  <div className="flex flex-col gap-1.5">
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
                    <Button type="button" variant="outline" className="h-9 gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {image ? "Replace" : "Upload"}
                    </Button>
                    {image && <button className="text-left text-xs text-sambal hover:underline" onClick={() => setImage("")}>Remove photo</button>}
                  </div>
                </div>
              </div>
              <div><Label htmlFor="ed-name">Name</Label><Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" /></div>
              <div><Label htmlFor="ed-desc">Description</Label><Input id="ed-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1.5 h-11" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="ed-price">Price £</Label><Input id="ed-price" type="number" step="0.1" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1.5 h-11" inputMode="decimal" /></div>
                <div>
                  <Label htmlFor="ed-cat">Category</Label>
                  <select id="ed-cat" value={category} onChange={(e) => setCategory(e.target.value as MenuCategory)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                    {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="ed-lead">Advance notice (hours)</Label>
                <Input id="ed-lead" type="number" step="1" min="0" value={lead} onChange={(e) => setLead(e.target.value)} className="mt-1.5 h-11 w-32" inputMode="numeric" placeholder="0" />
                <p className="mt-1 text-xs text-muted-foreground">Set 24 for next-day pre-order dishes. Assign the category to <strong>Pre-order</strong> to list it separately.</p>
              </div>
              <div>
                <Label htmlFor="ed-ai">AI assistant info</Label>
                <textarea
                  id="ed-ai"
                  value={aiNotes}
                  onChange={(e) => setAiNotes(e.target.value)}
                  rows={4}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Extra details customers might ask about — key ingredients, how it's cooked, spice heat, portion size, what it pairs with, whether it can be made vegan/gluten-free, etc. The 'Ask about this' assistant uses this to answer questions."
                />
                <p className="mt-1 text-xs text-muted-foreground">Only used to answer customer questions — not shown on the menu.</p>
              </div>
              <p className="text-xs text-muted-foreground">Base: {item.name} · {gbp(MENU.find((x) => x.id === item.id)!.price)}. Clearing a field back to base restores the default.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={uploading} onClick={() => onSave(item.id, {
                name, description, price: parseFloat(price), category,
                leadTimeHours: lead ? parseInt(lead, 10) : 0, aiNotes, image,
              })}>Save</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
