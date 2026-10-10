"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSiteContent } from "@/components/site-content-provider";
import { telHref } from "@/lib/site-content";

// The message is sent from the customer's own email app, straight to the restaurant's inbox, so
// nothing is ever silently lost (the site has no email service of its own).
export function ContactForm() {
  const { business: b } = useSiteContent();
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const valid = name.trim().length > 1 && message.trim().length > 4;
  const mailto = `mailto:${b.email}?subject=${encodeURIComponent(`Website message from ${name.trim()}`)}&body=${encodeURIComponent(message.trim())}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    window.location.href = mailto;
    setOpened(true);
  }

  if (opened) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <CheckCircle2 className="size-10 text-jade" />
        <p className="font-display text-xl font-bold">Your email app should now be open</p>
        <p className="text-muted-foreground">
          Press send there to reach us. Nothing opened? Email <a className="underline" href={mailto}>{b.email}</a> or call <a className="underline" href={telHref(b.phone)}>{b.phone}</a>.
        </p>
        <Button variant="outline" className="mt-2" onClick={() => setOpened(false)}>Back to the form</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <Label htmlFor="cname">Name</Label>
        <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" autoComplete="name" required />
      </div>
      <div className="mt-4">
        <Label htmlFor="cmsg">Message</Label>
        <Textarea id="cmsg" value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1.5 min-h-32" placeholder="How can we help? (For allergies or today's order, please call us.)" required />
      </div>
      <Button type="submit" className="mt-5 h-12 w-full gap-2 font-semibold sm:w-auto sm:px-8" disabled={!valid}>
        <Send className="size-4" /> Write email
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">Opens your email app addressed to {b.email}.</p>
    </form>
  );
}
