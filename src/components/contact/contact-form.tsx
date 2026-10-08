"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const valid = name.trim().length > 1 && /.+@.+\..+/.test(email) && message.trim().length > 4;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    // Demo: no network call. Wire to your email/CRM provider in production.
    setSent(true);
    toast.success("Message sent - we'll be in touch soon!");
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <CheckCircle2 className="size-10 text-jade" />
        <p className="font-display text-xl font-bold">Thanks, {name.split(" ")[0]}!</p>
        <p className="text-muted-foreground">We've received your message and will reply by email shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cname">Name</Label>
          <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" autoComplete="name" required />
        </div>
        <div>
          <Label htmlFor="cemail">Email</Label>
          <Input id="cemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11" inputMode="email" autoComplete="email" required />
        </div>
      </div>
      <div className="mt-4">
        <Label htmlFor="cmsg">Message</Label>
        <Textarea id="cmsg" value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1.5 min-h-32" placeholder="How can we help?" required />
      </div>
      <Button type="submit" className="mt-5 h-12 w-full gap-2 font-semibold sm:w-auto sm:px-8" disabled={!valid}>
        <Send className="size-4" /> Send message
      </Button>
    </form>
  );
}
