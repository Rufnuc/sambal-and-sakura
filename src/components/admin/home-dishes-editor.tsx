"use client";

import { useRef, useState } from "react";
import { ArrowUp, ArrowDown, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DishImage } from "@/components/brand/dish-image";
import { realPhoto } from "@/lib/photo";
import { useMenu } from "@/lib/use-menu";
import { uploadImage } from "@/lib/admin/api";
import type { HeroImage, SiteContent } from "@/lib/site-content";

const SLOT_NAMES = ["Front-left plate", "Back-right plate", "Bottom-right plate"];
const select = "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm";

/** Dish picker grouped by menu section. */
function DishSelect({ value, onChange, exclude = [] }: { value: string; onChange: (id: string) => void; exclude?: string[] }) {
  const { menu, categories } = useMenu();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={select}>
      {categories.map(({ id: c, label }) => {
        const dishes = menu.filter((m) => m.category === c && (m.id === value || !exclude.includes(m.id)));
        return dishes.length ? <optgroup key={c} label={label}>{dishes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup> : null;
      })}
    </select>
  );
}

/** The three stacked plates in the top banner. `menuPhotos`: photos uploaded in Admin → Menu (by dish id). */
export function HeroImagesEditor({ hero, onChange, menuPhotos }: {
  hero: SiteContent["hero"]; onChange: (h: Partial<SiteContent["hero"]>) => void; menuPhotos: Record<string, string | undefined>;
}) {
  const { menu } = useMenu();
  const [busy, setBusy] = useState<number | null>(null);
  const files = useRef<(HTMLInputElement | null)[]>([]);
  const setSlot = (i: number, p: Partial<HeroImage>) => onChange({ images: hero.images.map((img, idx) => (idx === i ? { ...img, ...p } : img)) });

  async function upload(i: number, file: File | undefined) {
    if (!file) return;
    setBusy(i);
    const res = await uploadImage(file);
    setBusy(null);
    if (res.ok && res.url) { setSlot(i, { photo: res.url }); toast.success("Photo added - press Save to publish"); }
    else toast.error(res.error ?? "Upload failed.");
    const el = files.current[i]; if (el) el.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        The three stacked plates beside the headline (under it on phones). Pick a dish for each: it shows that dish&apos;s photo
        from <b>Admin → Menu</b>, or upload a different photo just for the banner.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {hero.images.map((img, i) => {
          const dish = menu.find((m) => m.id === img.dishId);
          const src = img.photo || realPhoto(menuPhotos[img.dishId]);
          return (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <Label className="text-xs">{SLOT_NAMES[i]}</Label>
              {dish && <DishImage name={dish.name} category={dish.category} src={src} className="aspect-[4/3] w-full" rounded="rounded-lg" />}
              <DishSelect value={img.dishId} onChange={(id) => setSlot(i, { dishId: id })} />
              <div className="flex flex-wrap items-center gap-2">
                <input ref={(el) => { files.current[i] = el; }} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => upload(i, e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={busy === i} onClick={() => files.current[i]?.click()}>
                  {busy === i ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {img.photo ? "Change photo" : "Upload a photo"}
                </Button>
                {img.photo && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={() => setSlot(i, { photo: "" })}>
                    <X className="size-4" /> Use menu photo
                  </Button>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="radio" name="hero-featured" checked={hero.featured === i} onChange={() => onChange({ featured: i })} className="size-4" />
                Show this dish&apos;s name on the &quot;Signature&quot; card
              </label>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="radio" name="hero-featured" checked={hero.featured === -1} onChange={() => onChange({ featured: -1 })} className="size-4" /> No name card
      </label>
    </div>
  );
}

/** "Signature dishes" on the home page: automatic, or up to 6 picked by the owner in order. */
export function SignatureEditor({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const auto = ids.length === 0;
  const move = (i: number, d: number) => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  const { menu } = useMenu();
  const firstFree = () => menu.find((m) => !ids.includes(m.id))?.id;
  const suggested = menu.filter((m) => m.tags.includes("chef") || m.tags.includes("popular")).slice(0, 6).map((m) => m.id);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-sm">
        <label className="flex items-center gap-2"><input type="radio" checked={auto} onChange={() => onChange([])} className="size-4" /> Automatic: chef&apos;s specials and popular dishes</label>
        <label className="flex items-center gap-2"><input type="radio" checked={!auto} onChange={() => auto && onChange(suggested)} className="size-4" /> Choose the dishes myself (up to 6, in this order)</label>
      </div>
      {!auto && (
        <>
          <div className="flex flex-col gap-2">
            {ids.map((id, i) => (
              <div key={id} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <DishSelect value={id} exclude={ids} onChange={(next) => onChange(ids.map((x, idx) => (idx === i ? next : x)))} />
                <div className="flex">
                  <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowUp className="size-4" /></button>
                  <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowDown className="size-4" /></button>
                  <button type="button" aria-label="Remove" onClick={() => onChange(ids.filter((_, idx) => idx !== i))} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-sambal"><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="h-9 w-fit gap-1" disabled={ids.length >= 6} onClick={() => { const f = firstFree(); if (f) onChange([...ids, f]); }}>
            <Plus className="size-4" /> Add a dish
          </Button>
          <p className="text-xs text-muted-foreground">Phones show 2 per row, so an even number looks best. Sold-out dishes still show, marked sold out. Removing the last dish switches back to automatic.</p>
        </>
      )}
    </div>
  );
}
