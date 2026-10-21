"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Flame, Leaf, Pencil, Upload, Loader2, Clock, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Trash2, Plus, Eye, EyeOff, X, FolderTree,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { DishImage } from "@/components/brand/dish-image";
import { realPhoto } from "@/lib/photo";
import {
  MENU, ALLERGENS, ALLERGEN_LABELS, DIET_TAGS, categoryLabel,
  type MenuCategory, type MenuCategoryCfg, type MenuItem, type ModifierGroup, type Allergen, type DietTag,
} from "@/lib/data/menu";
import { saveConfig, uploadImage, fetchMenuAvailability, setSoldOut, ConflictError, type AdminConfig, type MenuOverrideCfg } from "@/lib/admin/api";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Overrides = AdminConfig["menuOverrides"];
const MAX_PHOTOS = 6;
const BASE = new Map(MENU.map((m) => [m.id, m]));
const select = "h-11 rounded-lg border border-border bg-background px-3 text-sm";

// Ids for things the owner creates: lower-case letters, numbers and dashes (what the server accepts).
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
const rand = () => Math.random().toString(36).slice(2, 6);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Built-in dish with the owner's changes applied (mirrors applyOverride in src/server/config.ts). */
function withOverride(m: MenuItem, o: MenuOverrideCfg | undefined): MenuItem {
  if (!o) return m;
  return {
    ...m,
    name: o.name ?? m.name,
    description: o.description ?? m.description,
    price: typeof o.price === "number" ? o.price : m.price,
    soldOut: typeof o.soldOut === "boolean" ? o.soldOut : m.soldOut,
    ...(o.images ? { image: o.images[0] ?? "", images: o.images } : { image: o.image ?? m.image, images: o.image ? [o.image] : undefined }),
    category: o.category ?? m.category,
    leadTimeHours: typeof o.leadTimeHours === "number" ? o.leadTimeHours : m.leadTimeHours,
    aiNotes: o.aiNotes ?? m.aiNotes,
    modifiers: o.modifiers ?? m.modifiers,
    allergens: o.allergens ?? m.allergens,
    allergensChecked: o.allergens ? o.allergensChecked : m.allergensChecked,
    tags: o.tags ?? m.tags,
    spiceLevel: o.spiceLevel ?? m.spiceLevel,
    phoneOrder: typeof o.phoneOrder === "boolean" ? o.phoneOrder : m.phoneOrder,
    hidden: !!o.hidden,
  };
}

export function MenuView() {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [custom, setCustom] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategoryCfg[]>([]);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<MenuCategory | "all">("all");
  const [sort, setSort] = useState<"default" | "price-asc" | "price-desc" | "name">("default");
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [showCats, setShowCats] = useState(false);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [canEdit, setCanEdit] = useState(false); // owner: full edits; staff: sold-out switch only
  const [menuVersion, setMenuVersion] = useState(""); // what this screen loaded; sent back with every save

  const reload = () => fetchMenuAvailability().then((r) => {
    setOverrides(r?.menuOverrides ?? {}); setCustom(r?.customDishes ?? []); setCategories(r?.categories ?? []);
    setMenuVersion(r?.menuVersion ?? ""); setCanEdit(!!r?.canEdit); setReady(true);
  });
  useEffect(() => { void reload(); }, []);

  const all = useMemo(() => [...MENU.map((m) => withOverride(m, overrides[m.id])), ...custom], [overrides, custom]);
  const label = (id: string) => categoryLabel(categories, id);

  // Saves one menu piece; the server checks the pieces still fit together (e.g. no dish left without a category).
  async function save(patch: Pick<Partial<AdminConfig>, "menuOverrides" | "customDishes" | "categories">): Promise<boolean> {
    try {
      const c = await saveConfig({ ...patch, menuBaseVersion: menuVersion });
      setOverrides(c.menuOverrides ?? {}); setCustom(c.customDishes ?? []); setCategories(c.categories ?? []);
      setMenuVersion(c.menuVersion ?? "");
      return true;
    } catch (e) {
      toast.error((e as Error).message, { duration: e instanceof ConflictError ? 10_000 : undefined });
      if (e instanceof ConflictError) { setEditing(null); await reload(); } // show what changed; nothing was saved
      return false;
    }
  }

  async function toggleSoldOut(m: MenuItem) {
    const next = await setSoldOut(m.id, !m.soldOut);
    if (!next) { toast.error("Could not update. Check your connection."); return; }
    setOverrides(next.menuOverrides); setCustom(next.customDishes); setMenuVersion(next.menuVersion);
    toast.success(`${m.name} marked ${!m.soldOut ? "sold out" : "available"}`);
  }

  async function toggleHidden(m: MenuItem) {
    const hide = !m.hidden;
    const ok = m.custom
      ? await save({ customDishes: custom.map((d) => (d.id === m.id ? { ...d, hidden: hide || undefined } : d)) })
      : await save({ menuOverrides: withHidden(overrides, m.id, hide) });
    if (ok) toast.success(hide ? `${m.name} hidden from the menu` : `${m.name} is back on the menu`);
  }

  async function removeDish(m: MenuItem) {
    if (await save({ customDishes: custom.filter((d) => d.id !== m.id) })) { toast.success(`${m.name} deleted`); setDeleting(null); }
  }

  async function saveBuiltIn(id: string, patch: DishForm) {
    const base = BASE.get(id)!;
    const o: MenuOverrideCfg = { ...overrides[id] };
    const set = <K extends keyof MenuOverrideCfg>(k: K, v: MenuOverrideCfg[K], baseVal: unknown) => {
      if (v !== undefined && v !== "" && !sameJson(v, baseVal)) o[k] = v; else delete o[k];
    };
    set("name", patch.name.trim(), base.name);
    set("description", patch.description.trim(), base.description);
    set("price", Number.isFinite(patch.price) ? Math.round(patch.price * 100) / 100 : undefined, base.price);
    set("category", patch.category, base.category);
    set("leadTimeHours", patch.leadTimeHours > 0 ? patch.leadTimeHours : undefined, base.leadTimeHours);
    set("aiNotes", patch.aiNotes.trim(), base.aiNotes);
    set("modifiers", patch.modifiers.length ? patch.modifiers : undefined, base.modifiers);
    if (!patch.modifiers.length && base.modifiers?.length) o.modifiers = []; // the owner removed every choice
    // Allergens are only stored once the owner has confirmed them (an empty, confirmed list = "none of the 14").
    if (patch.allergensChecked) { o.allergens = patch.allergens; o.allergensChecked = true; } else { delete o.allergens; delete o.allergensChecked; }
    set("tags", patch.tags, base.tags);
    set("spiceLevel", patch.spiceLevel, base.spiceLevel ?? 0);
    set("phoneOrder", patch.phoneOrder || undefined, base.phoneOrder);
    if (!patch.phoneOrder && base.phoneOrder) o.phoneOrder = false;
    // Photos: the whole set (main first); `image` mirrors the main one for anything that shows a single photo.
    if (patch.images.length) { o.images = patch.images; o.image = patch.images[0]; } else { delete o.images; delete o.image; }
    const next = { ...overrides, [id]: o };
    if (Object.keys(o).length === 0) delete next[id];
    if (!(await save({ menuOverrides: next }))) return; // error already shown; keep the dialog open to fix it
    toast.success("Dish updated");
    setEditing(null);
  }

  async function saveCustom(existing: MenuItem | null, f: DishForm) {
    const dish: MenuItem = {
      id: existing?.id ?? `c-${slug(f.name) || "dish"}-${rand()}`,
      name: f.name.trim(), description: f.description.trim(), category: f.category,
      price: Math.round(f.price * 100) / 100,
      allergens: f.allergens, allergensChecked: f.allergensChecked || undefined, tags: f.tags,
      spiceLevel: f.spiceLevel || undefined,
      image: f.images[0] ?? "", images: f.images.length ? f.images : undefined,
      leadTimeHours: f.leadTimeHours > 0 ? f.leadTimeHours : undefined,
      aiNotes: f.aiNotes.trim() || undefined,
      modifiers: f.modifiers.length ? f.modifiers : undefined,
      phoneOrder: f.phoneOrder || undefined,
      soldOut: existing?.soldOut, hidden: existing?.hidden, custom: true,
    };
    const next = existing ? custom.map((d) => (d.id === existing.id ? dish : d)) : [...custom, dish];
    if (!(await save({ customDishes: next }))) return;
    toast.success(existing ? "Dish updated" : `${dish.name} added to the menu`);
    setEditing(null);
  }

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = new Map(categories.map((c, i) => [c.id, i]));
    let list = all.filter((m) => (cat === "all" || m.category === cat) && (!q || m.name.toLowerCase().includes(q)));
    if (sort === "default") list = [...list].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99));
    else if (sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [query, cat, sort, all, categories]);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const hiddenCats = new Set(categories.filter((c) => c.hidden).map((c) => c.id));
  const offMenu = (m: MenuItem) => m.hidden || hiddenCats.has(m.category);
  const live = all.filter((m) => !offMenu(m));
  const soldOut = live.filter((m) => m.soldOut).length;
  const hiddenCount = all.length - live.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Menu</h1>
          <p className="text-muted-foreground">{live.length} on the menu · {soldOut} sold out · {hiddenCount} hidden · {custom.length} added by you</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={() => setShowCats(true)}><FolderTree className="size-4" /> Categories</Button>
            <Button className="h-11" onClick={() => setEditing("new")}><Plus className="size-4" /> Add dish</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="On the menu" value={String(live.length - soldOut)} accent="jade" />
        <StatCard label="Sold out" value={String(soldOut)} accent="sambal" />
        <StatCard label="Hidden" value={String(hiddenCount)} accent="gold" />
        <StatCard label="Categories" value={String(categories.filter((c) => !c.hidden).length)} accent="sakura" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search menu…" className="h-11 pl-9" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={select}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}{c.hidden ? " (hidden)" : ""}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={select}>
          <option value="default">Menu order</option>
          <option value="name">Name A–Z</option>
          <option value="price-asc">Price low–high</option>
          <option value="price-desc">Price high–low</option>
        </select>
      </div>

      <SectionCard>
        <ul className="divide-y divide-border">
          {items.map((m) => (
            <li key={m.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-3", offMenu(m) && "opacity-60")}>
              <DishImage name={m.name} category={m.category} className="size-14 shrink-0" rounded="rounded-lg" src={realPhoto(m.image)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate font-medium">{m.name}</p>
                  {m.spiceLevel ? <Flame className="size-3.5 text-sambal" /> : null}
                  {(m.tags.includes("vegetarian") || m.tags.includes("vegan")) && <Leaf className="size-3.5 text-jade" />}
                  {m.leadTimeHours ? <Badge variant="outline" className="gap-1 border-gold/30 bg-gold/10 text-gold-ink"><Clock className="size-3" />{m.leadTimeHours}h</Badge> : null}
                  {m.custom && <Badge variant="outline" className="border-sakura/30 bg-sakura/10 text-sakura">added</Badge>}
                  {m.hidden && <Badge variant="outline">hidden</Badge>}
                  {!m.hidden && hiddenCats.has(m.category) && <Badge variant="outline">category hidden</Badge>}
                  {!m.custom && overrides[m.id] && Object.keys(overrides[m.id]).some((k) => k !== "soldOut" && k !== "hidden") && <Badge variant="outline" className="border-gold/30 bg-gold/10 text-gold-ink">edited</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {label(m.category)}{m.modifiers?.length ? ` · ${m.modifiers.length} choice group${m.modifiers.length === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              {/* Price and controls: beside the dish on wide screens, on their own row on a phone */}
              <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
              <span className="mr-auto pl-[4.25rem] text-left font-semibold sm:mr-0 sm:w-20 sm:pl-0 sm:text-right">{m.modifiers?.length ? <span className="text-xs font-normal text-muted-foreground">from </span> : null}{gbp(m.price)}</span>
              {canEdit && (
                <>
                  <Button size="icon-sm" variant="ghost" aria-label={m.hidden ? `Show ${m.name} on the menu` : `Hide ${m.name} from the menu`} title={m.hidden ? "Show on the menu" : "Hide from the menu"} onClick={() => toggleHidden(m)}>
                    {m.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}><Pencil className="size-4" /></Button>
                  {m.custom && <Button size="icon-sm" variant="ghost" aria-label={`Delete ${m.name}`} className="text-sambal" onClick={() => setDeleting(m)}><Trash2 className="size-4" /></Button>}
                </>
              )}
              <button onClick={() => toggleSoldOut(m)} role="switch" aria-checked={!m.soldOut} aria-label={`${m.name} availability`} className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition", m.soldOut ? "bg-muted" : "bg-jade")}>
                <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", m.soldOut ? "translate-x-1" : "translate-x-6")} />
              </button>
              </div>
            </li>
          ))}
        </ul>
        {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No dishes match.</p>}
      </SectionCard>

      <DishDialog
        item={editing} categories={categories} onClose={() => setEditing(null)}
        onSave={(f) => (editing === "new" ? saveCustom(null, f) : editing?.custom ? saveCustom(editing, f) : editing ? saveBuiltIn(editing.id, f) : undefined)}
      />
      <CategoriesDialog open={showCats} onClose={() => setShowCats(false)} categories={categories} dishes={all} onSave={(c) => save({ categories: c })} />
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>It comes off the menu for good. Past orders keep their details. To take it off for a while instead, hide it.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleting && removeDish(deleting)}>Delete dish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function withHidden(ov: Overrides, id: string, hide: boolean): Overrides {
  const o: MenuOverrideCfg = { ...ov[id] };
  if (hide) o.hidden = true; else delete o.hidden;
  const next = { ...ov, [id]: o };
  if (Object.keys(o).length === 0) delete next[id];
  return next;
}

/* ---------------- Add / edit a dish ---------------- */

interface DishForm {
  name: string; description: string; price: number; category: string; leadTimeHours: number; aiNotes: string; images: string[];
  modifiers: ModifierGroup[]; allergens: Allergen[]; allergensChecked: boolean; tags: DietTag[]; spiceLevel: 0 | 1 | 2 | 3;
  phoneOrder: boolean;
}

function DishDialog({ item, categories, onClose, onSave }: {
  item: MenuItem | "new" | null; categories: MenuCategoryCfg[]; onClose: () => void; onSave: (f: DishForm) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        {/* Keyed so each dish opens with a fresh form */}
        {item && <DishEditor key={item === "new" ? "new" : item.id} item={item} categories={categories} onClose={onClose} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function DishEditor({ item, categories, onClose, onSave }: {
  item: MenuItem | "new"; categories: MenuCategoryCfg[]; onClose: () => void; onSave: (f: DishForm) => void;
}) {
  const isNew = item === "new";
  const dish = item !== "new" ? item : null;
  const builtIn = !!dish && !dish.custom; // a dish from the printed menu (changes are saved as overrides)
  const [name, setName] = useState(dish?.name ?? "");
  const [price, setPrice] = useState(dish ? String(dish.price) : "");
  const [description, setDescription] = useState(dish?.description ?? "");
  const [category, setCategory] = useState(dish?.category ?? categories.find((c) => !c.hidden)?.id ?? categories[0]?.id ?? "");
  const [lead, setLead] = useState(dish?.leadTimeHours ? String(dish.leadTimeHours) : "");
  const [aiNotes, setAiNotes] = useState(dish?.aiNotes ?? "");
  const [photos, setPhotos] = useState<string[]>(() => // main first
    dish ? (dish.images?.length ? dish.images : [dish.image]).map((p) => realPhoto(p)).filter((p): p is string => !!p) : []);
  const [modifiers, setModifiers] = useState<ModifierGroup[]>(() => structuredClone(dish?.modifiers ?? []));
  const [allergens, setAllergens] = useState<Allergen[]>(dish?.allergens ?? []);
  const [checked, setChecked] = useState(!!dish?.allergensChecked);
  const [tags, setTags] = useState<DietTag[]>(dish?.tags ?? []);
  const [spice, setSpice] = useState<0 | 1 | 2 | 3>(dish?.spiceLevel ?? 0);
  const [phoneOrder, setPhoneOrder] = useState(!!dish?.phoneOrder);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Several photos can be picked at once; each is shrunk in the browser and uploaded in turn.
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, Math.max(0, MAX_PHOTOS - photos.length));
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) { if (photos.length >= MAX_PHOTOS) toast.error(`Up to ${MAX_PHOTOS} photos per dish.`); return; }
    setUploading(true);
    let added = 0;
    for (const file of files) {
      const res = await uploadImage(file);
      if (res.ok && res.url) { const url = res.url; setPhotos((p) => (p.includes(url) || p.length >= MAX_PHOTOS ? p : [...p, url])); added++; }
      else toast.error(res.error ?? "Upload failed.");
    }
    setUploading(false);
    if (added) toast.success(`${added} photo${added === 1 ? "" : "s"} added - press Save to publish`);
  }
  const movePhoto = (i: number, d: number) => setPhotos((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const toggleAllergen = (a: Allergen) => { setAllergens((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a])); setChecked(false); };
  const toggleTag = (t: DietTag) => setTags((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));

  function submit() {
    const p = parseFloat(price);
    if (!name.trim()) { toast.error("Give the dish a name."); return; }
    if (!Number.isFinite(p) || p < 0) { toast.error("Enter a price, e.g. 8.50."); return; }
    if (!builtIn && !checked) { toast.error("Tick the allergens (or confirm it contains none) before saving."); return; }
    // Printed-menu dishes can be saved before their allergens are known, but a changed list must be confirmed.
    if (builtIn && !checked && !sameJson(allergens, dish!.allergens)) { toast.error("Tick that you've checked the allergens, or put them back as they were."); return; }
    const bad = modifiers.find((g) => !g.label.trim() || !g.options.length || g.options.some((o) => !o.label.trim()));
    if (bad) { toast.error("Every choice group needs a name and at least one named option."); return; }
    onSave({
      name, description, price: p, category, leadTimeHours: lead ? parseInt(lead, 10) : 0, aiNotes, images: photos,
      modifiers, allergens, allergensChecked: checked, tags, spiceLevel: spice, phoneOrder,
    });
  }

  return (
          <>
            <DialogHeader><DialogTitle className="font-display">{isNew ? "Add a dish" : `Edit ${dish?.name}`}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4">
              {/* Photos: up to 6, the first is the main one (customers can swipe through the rest) */}
              <div>
                <Label>Photos <span className="font-normal text-muted-foreground">({photos.length}/{MAX_PHOTOS})</span></Label>
                <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((src, i) => (
                    <div key={src} className="relative">
                      <DishImage name={name || "Dish"} category={category} className="aspect-square w-full" rounded="rounded-lg" src={src} />
                      {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">Main</span>}
                      <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
                        <div className="flex gap-0.5">
                          <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => movePhoto(i, -1)} className="flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow disabled:opacity-40"><ArrowLeft className="size-3.5" /></button>
                          <button type="button" aria-label="Move later" disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)} className="flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow disabled:opacity-40"><ArrowRight className="size-3.5" /></button>
                        </div>
                        <button type="button" aria-label="Remove photo" onClick={() => setPhotos((p) => p.filter((x) => x !== src))} className="flex size-6 items-center justify-center rounded-full bg-background/90 text-sambal shadow"><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-60">
                      {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                      {uploading ? "Uploading…" : photos.length ? "Add photos" : "Upload photos"}
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={onPick} />
                <p className="mt-1 text-xs text-muted-foreground">The first photo is the main one. No photo yet? A branded placeholder is shown.</p>
              </div>

              <div><Label htmlFor="ed-name">Name</Label><Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" maxLength={80} /></div>
              <div><Label htmlFor="ed-desc">Description</Label><Input id="ed-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1.5 h-11" maxLength={600} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="ed-price">Price £ {modifiers.length > 0 && <span className="font-normal text-muted-foreground">(the &quot;from&quot; price)</span>}</Label><Input id="ed-price" type="number" step="0.1" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1.5 h-11" inputMode="decimal" /></div>
                <div>
                  <Label htmlFor="ed-cat">Category</Label>
                  <select id="ed-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={cn(select, "mt-1.5 w-full")}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.label}{c.hidden ? " (hidden)" : ""}</option>)}
                  </select>
                </div>
              </div>

              <ChoicesEditor groups={modifiers} onChange={setModifiers} />

              {/* Allergens: required for dishes the owner adds; for printed-menu dishes the kitchen fills them in. */}
              <div className="rounded-lg border border-border p-3">
              <Label>Allergens</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">Tick every one of the 14 allergens the dish contains. Customers see these on the menu{builtIn ? '; until they are confirmed here the dish says "Allergens not listed yet - please ask us"' : ""}.</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3">
                {ALLERGENS.filter((a) => a !== "shellfish").map((a) => (
                  <label key={a} className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={allergens.includes(a)} onChange={() => toggleAllergen(a)} /> {ALLERGEN_LABELS[a]}</label>
                ))}
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm font-medium">
                <input type="checkbox" className="mt-0.5 size-4" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                {allergens.length ? "I've checked these allergens are right for this dish" : "I've checked: this dish contains none of the 14 allergens"}
              </label>
            </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label>Labels</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {DIET_TAGS.map((t) => (
                      <button key={t.id} type="button" onClick={() => toggleTag(t.id)} aria-pressed={tags.includes(t.id)} className={cn("rounded-full border px-3 py-1 text-xs transition", tags.includes(t.id) ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="ed-spice">Spice</Label>
                  <select id="ed-spice" value={spice} onChange={(e) => setSpice(Number(e.target.value) as 0 | 1 | 2 | 3)} className={cn(select, "mt-1.5 w-full")}>
                    <option value={0}>Not spicy</option><option value={1}>Mild</option><option value={2}>Medium</option><option value={3}>Hot</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4" checked={phoneOrder} onChange={(e) => setPhoneOrder(e.target.checked)} />
                <span><span className="font-medium">Phone to order only</span><span className="block text-xs text-muted-foreground">Shown on the menu with a &quot;Phone to order&quot; button instead of Add (e.g. seasonal-price lobster). It can&apos;t be ordered online. Price 0 shows as &quot;Seasonal price&quot;.</span></span>
              </label>

              <div>
                <Label htmlFor="ed-lead">Advance notice (hours)</Label>
                <Input id="ed-lead" type="number" step="1" min="0" max="168" value={lead} onChange={(e) => setLead(e.target.value)} className="mt-1.5 h-11 w-32" inputMode="numeric" placeholder="0" />
                <p className="mt-1 text-xs text-muted-foreground">Set 24 for next-day pre-order dishes.</p>
              </div>
              <div>
                <Label htmlFor="ed-ai">AI assistant info</Label>
                <textarea id="ed-ai" value={aiNotes} onChange={(e) => setAiNotes(e.target.value)} rows={3} maxLength={1500}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Key ingredients, how it's cooked, portion size, what it pairs with... The 'Ask about this' assistant uses this to answer questions." />
                <p className="mt-1 text-xs text-muted-foreground">Only used to answer customer questions, not shown on the menu.</p>
              </div>
              {builtIn && <p className="text-xs text-muted-foreground">Original: {BASE.get(dish!.id)!.name} · {gbp(BASE.get(dish!.id)!.price)}. Setting a field back to the original restores the default.</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={uploading} onClick={submit}>{isNew ? "Add to menu" : "Save"}</Button>
            </DialogFooter>
          </>
  );
}

/** Choices customers pick when adding the dish: e.g. "Size" (pick one, required) or "Extras" (pick any). */
function ChoicesEditor({ groups, onChange }: { groups: ModifierGroup[]; onChange: (g: ModifierGroup[]) => void }) {
  const setGroup = (i: number, p: Partial<ModifierGroup>) => onChange(groups.map((g, j) => (j === i ? { ...g, ...p } : g)));
  const addGroup = () => onChange([...groups, { id: `g-${rand()}`, label: "", type: "single", required: true, options: [{ id: `o-${rand()}`, label: "", priceDelta: 0 }] }]);
  const move = (i: number, d: number) => { const n = [...groups]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label>Choices</Label>
          <p className="text-xs text-muted-foreground">Sizes, proteins, extras. Each option can add to the price.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addGroup} disabled={groups.length >= 8}><Plus className="size-4" /> Add choice</Button>
      </div>
      {groups.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No choices: customers add the dish as it is.</p>}
      <div className="mt-2 flex flex-col gap-3">
        {groups.map((g, i) => (
          <div key={g.id} className="rounded-lg bg-muted/40 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Choice name" value={g.label} onChange={(e) => setGroup(i, { label: e.target.value })} placeholder='e.g. "Size" or "Extras"' className="h-10 min-w-40 flex-1" maxLength={60} />
              <select aria-label="How many can be picked" value={g.type} onChange={(e) => setGroup(i, { type: e.target.value as "single" | "multi" })} className="h-10 rounded-lg border border-border bg-background px-2 text-sm">
                <option value="single">Pick one</option>
                <option value="multi">Pick any</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="size-4" checked={!!g.required} onChange={(e) => setGroup(i, { required: e.target.checked || undefined })} /> Required</label>
              <div className="flex">
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Move choice up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Move choice down" disabled={i === groups.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove choice" className="text-sambal" onClick={() => onChange(groups.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {g.options.map((o, k) => (
                <li key={o.id} className="flex items-center gap-2">
                  <Input aria-label="Option name" value={o.label} onChange={(e) => setGroup(i, { options: g.options.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} placeholder="Option, e.g. Chicken" className="h-9 flex-1" maxLength={60} />
                  <span className="text-xs text-muted-foreground">+£</span>
                  <Input aria-label="Adds to the price" type="number" min="0" step="0.1" value={o.priceDelta} inputMode="decimal" className="h-9 w-20"
                    onChange={(e) => setGroup(i, { options: g.options.map((x, m) => (m === k ? { ...x, priceDelta: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100) / 100) } : x)) })} />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove option" disabled={g.options.length === 1} onClick={() => setGroup(i, { options: g.options.filter((_, m) => m !== k) })}><X className="size-4" /></Button>
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" variant="ghost" className="mt-1" disabled={g.options.length >= 30} onClick={() => setGroup(i, { options: [...g.options, { id: `o-${rand()}`, label: "", priceDelta: 0 }] })}><Plus className="size-4" /> Add option</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Categories ---------------- */

type CategoriesProps = { onClose: () => void; categories: MenuCategoryCfg[]; dishes: MenuItem[]; onSave: (c: MenuCategoryCfg[]) => Promise<boolean> };

function CategoriesDialog({ open, ...props }: CategoriesProps & { open: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        {open && <CategoriesEditor {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function CategoriesEditor({ onClose, categories, dishes, onSave }: CategoriesProps) {
  const [list, setList] = useState<MenuCategoryCfg[]>(() => categories.map((c) => ({ ...c })));
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const count = (id: string) => dishes.filter((d) => d.category === id).length;
  const set = (i: number, p: Partial<MenuCategoryCfg>) => setList((l) => l.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  function add() {
    const label = newName.trim();
    if (!label) return;
    if (list.some((c) => c.label.toLowerCase() === label.toLowerCase())) { toast.error(`There's already a category called "${label}".`); return; }
    let id = slug(label) || "category";
    while (list.some((c) => c.id === id)) id = `${slug(label) || "category"}-${rand()}`;
    setList((l) => [...l, { id, label }]);
    setNewName("");
  }
  async function save() {
    if (list.some((c) => !c.label.trim())) { toast.error("Every category needs a name."); return; }
    setSaving(true);
    const ok = await onSave(list.map((c) => ({ id: c.id, label: c.label.trim(), ...(c.hidden ? { hidden: true } : {}) })));
    setSaving(false);
    if (ok) { toast.success("Categories saved"); onClose(); }
  }

  return (
      <>
        <DialogHeader>
          <DialogTitle className="font-display">Menu categories</DialogTitle>
          <DialogDescription>Rename, reorder, hide or remove sections of the menu. A category with dishes in it can be hidden (its dishes leave the menu with it) but not removed until its dishes are moved.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5">
          {list.map((c, i) => {
            const n = count(c.id);
            return (
              <li key={c.id} className={cn("flex items-center gap-1.5", c.hidden && "opacity-60")}>
                <Input aria-label="Category name" value={c.label} onChange={(e) => set(i, { label: e.target.value })} className="h-10 flex-1" maxLength={40} />
                <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">{n} dish{n === 1 ? "" : "es"}</span>
                <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={c.hidden ? `Show ${c.label}` : `Hide ${c.label}`} title={c.hidden ? "Show on the menu" : "Hide from the menu"} onClick={() => set(i, { hidden: !c.hidden || undefined })}>
                  {c.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-sambal" aria-label={`Remove ${c.label}`} disabled={n > 0 || list.length === 1}
                  title={n > 0 ? `Move its ${n} dish${n === 1 ? "" : "es"} to another category first, or hide it` : "Remove category"}
                  onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New category, e.g. Bubble Tea" className="h-10" maxLength={40} />
          <Button variant="outline" onClick={add} disabled={!newName.trim() || list.length >= 40}><Plus className="size-4" /> Add</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null} Save categories</Button>
        </DialogFooter>
      </>
  );
}
