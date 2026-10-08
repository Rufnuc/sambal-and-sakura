import type { Metadata } from "next";
import { Phone, Mail, MapPin, Clock, Bike } from "lucide-react";
import { ContactForm } from "@/components/contact/contact-form";
import { OpenStatus } from "@/components/brand/open-status";
import { MapEmbed } from "@/components/brand/map-embed";
import { ORDERING } from "@/lib/data/site";
import { getSiteContent } from "@/server/site-content";
import { telHref, formatAddress } from "@/lib/site-content";
import { formatHours } from "@/lib/hours";

export const metadata: Metadata = {
  title: "Contact",
  description: "Call, email or message us. Find our address, opening hours and delivery coverage.",
};

export default async function ContactPage() {
  const { business: b } = await getSiteContent();
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <header className="max-w-2xl">
        <p className="font-medium uppercase tracking-widest text-gold">Say hello</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Contact & find us</h1>
        <p className="mt-3 text-muted-foreground">Questions, feedback, or a big booking? We'd love to hear from you.</p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <ContactCard icon={Phone} label="Call us" value={b.phone} href={telHref(b.phone)} />
            <ContactCard icon={Mail} label="Email" value={b.email} href={`mailto:${b.email}`} />
            <ContactCard icon={MapPin} label="Find us" value={formatAddress(b.address)} />
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <Bike className="size-5 text-primary" />
              <p className="mt-2 font-semibold">Delivery coverage</p>
              <p className="text-sm text-muted-foreground">{ORDERING.deliveryZones.map((z) => z.postcodes.join(", ")).join(" · ")}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Clock className="size-5 text-primary" /> Opening hours</h2>
              <OpenStatus compact />
            </div>
            <ul className="space-y-1 text-sm">
              {b.hours.map((h) => (
                <li key={h.day} className="flex justify-between border-b border-border/60 py-1 last:border-0">
                  <span className="text-muted-foreground">{h.day}</span>
                  <span className={h.sessions.length ? "" : "text-muted-foreground"}>{formatHours(h)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            <MapEmbed query={b.mapQuery} title="Map to Sambal and Sakura" className="h-64" />
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-display text-xl font-bold">Send a message</h2>
          <ContactForm />
        </div>
      </div>
    </div>
  );
}

function ContactCard({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value: string; href?: string }) {
  const inner = (
    <>
      <Icon className="size-5 text-primary" />
      <p className="mt-2 font-semibold">{label}</p>
      <p className="text-sm text-muted-foreground">{value}</p>
    </>
  );
  const cls = "rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md";
  return href ? <a href={href} className={cls}>{inner}</a> : <div className={cls}>{inner}</div>;
}
