"use client";

import { useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/context";
import type { MenuItem } from "@/lib/data/menu";
import { track } from "@/lib/analytics";

const LOCALE_NAME: Record<string, string> = { en: "English", zh: "Chinese", vi: "Vietnamese", ja: "Japanese" };

const SUGGESTIONS = [
  "What's in it?",
  "Is it spicy?",
  "Can I have it without onions?",
  "Can I get extra sauce?",
];

export function DishAssistant({ item, compact = false }: { item: MenuItem; compact?: boolean }) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setAnswer("");
    track("dish_assistant_ask", { id: item.id });
    try {
      const res = await fetch("/api/dish-assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, question: text, localeName: LOCALE_NAME[locale] ?? "English" }),
      });
      const data = await res.json().catch(() => ({}));
      setAnswer(data.answer ?? data.error ?? "Sorry, I couldn't answer that.");
    } catch {
      setAnswer("Sorry, I couldn't reach the assistant. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setAnswer(""); setQuestion(""); } }}>
      <DialogTrigger
        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-gold/40 hover:bg-gold/10 hover:text-gold-ink"
        aria-label={`Ask about ${item.name}`}
      >
        <Sparkles className="size-3.5" /> {compact ? (<><span className="sm:hidden">Ask</span><span className="hidden sm:inline">Ask about this</span></>) : "Ask about this"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Sparkles className="size-5 text-gold-ink" /> {item.name}
          </DialogTitle>
          <DialogDescription>
            Ask anything about this dish — ingredients, spice, or a change like &quot;no onions&quot; or &quot;extra sauce&quot;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex gap-2">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Type your question…" className="h-11" autoFocus />
          <Button type="submit" className="h-11 gap-1.5 px-4" disabled={loading || !question.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => { setQuestion(s); ask(s); }} disabled={loading}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>

        {(loading || answer) && (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
            {loading && !answer ? (
              <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Thinking…</p>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">{answer}</p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          AI assistant — for allergy certainty please phone the restaurant. Add any changes as a note at checkout.
        </p>
      </DialogContent>
    </Dialog>
  );
}
