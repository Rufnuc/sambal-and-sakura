"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/ui";
import { fetchConfig, saveConfig, type JobCfg } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

const TYPES = ["Full-time", "Part-time", "Contract"];

export function CareersView() {
  const [jobs, setJobs] = useState<JobCfg[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { fetchConfig().then((c) => { setJobs(c.careers ?? []); setReady(true); }); }, []);

  function update(i: number, patch: Partial<JobCfg>) {
    setJobs((j) => j.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function add() {
    setJobs((j) => [...j, { id: "job" + Date.now().toString(36), title: "New role", type: "Full-time", location: "Middlesbrough, TS1", summary: "", description: "", active: true }]);
  }
  async function save() {
    try {
      const c = await saveConfig({ careers: jobs });
      setJobs(c.careers ?? jobs);
      toast.success("Careers saved - live on /careers");
    } catch (e) { toast.error((e as Error).message); }
  }

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Careers</h1>
          <p className="text-muted-foreground">{jobs.filter((j) => j.active).length} live roles · shown on /careers and indexable by Google Jobs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10 gap-1.5" onClick={add}><Plus className="size-4" /> Add role</Button>
          <Button className="h-10 gap-1.5" onClick={save}><Save className="size-4" /> Save</Button>
        </div>
      </div>

      {jobs.map((j, i) => (
        <SectionCard key={j.id}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Briefcase className="size-4 text-gold-ink" /> {j.title || "Untitled role"}</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => update(i, { active: !j.active })} role="switch" aria-checked={j.active} className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition", j.active ? "bg-jade" : "bg-muted")}>
                <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", j.active ? "translate-x-6" : "translate-x-1")} />
              </button>
              <button aria-label="Remove role" onClick={() => setJobs((js) => js.filter((_, idx) => idx !== i))} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-sambal"><Trash2 className="size-4" /></button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Title</Label><Input value={j.title} onChange={(e) => update(i, { title: e.target.value })} className="mt-1 h-10" /></div>
            <div>
              <Label className="text-xs">Type</Label>
              <select value={j.type} onChange={(e) => update(i, { type: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Location</Label><Input value={j.location} onChange={(e) => update(i, { location: e.target.value })} className="mt-1 h-10" /></div>
          </div>
          <div className="mt-3"><Label className="text-xs">Summary (one line)</Label><Input value={j.summary} onChange={(e) => update(i, { summary: e.target.value })} className="mt-1 h-10" /></div>
          <div className="mt-3"><Label className="text-xs">Description</Label><Textarea value={j.description} onChange={(e) => update(i, { description: e.target.value })} className="mt-1 min-h-24" /></div>
        </SectionCard>
      ))}
      {jobs.length === 0 && <p className="text-sm text-muted-foreground">No roles yet. Add one - it&apos;ll appear on the public Careers page.</p>}
    </div>
  );
}
