import type { Metadata } from "next";
import { Briefcase, MapPin, Clock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCareers } from "@/server/config";
import { RESTAURANT } from "@/lib/data/site";
import { getSiteContent } from "@/server/site-content";
import { telHref } from "@/lib/site-content";

// Rendered on every request: this page shows admin-editable content, so it must NOT be frozen at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the Sambal & Sakura team in Middlesbrough - sushi chef, kitchen and delivery roles. Apply today.",
};

const EMP_TYPE: Record<string, string> = { "Full-time": "FULL_TIME", "Part-time": "PART_TIME", Contract: "CONTRACTOR" };

export default async function CareersPage() {
  const jobs = (await getCareers()).filter((j) => j.active);
  const { business: b } = await getSiteContent();

  const jsonLd = jobs.map((j) => ({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: j.title,
    description: j.description,
    employmentType: EMP_TYPE[j.type] ?? "OTHER",
    datePosted: new Date().toISOString().slice(0, 10),
    hiringOrganization: { "@type": "Organization", name: RESTAURANT.name, sameAs: "https://sambalandsakura.co.uk" },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", streetAddress: b.address.line1, addressLocality: b.address.city, postalCode: b.address.postcode, addressCountry: "GB" },
    },
    applicantLocationRequirements: { "@type": "Country", name: "United Kingdom" },
    directApply: true,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {jsonLd.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <header className="max-w-2xl">
        <p className="font-medium uppercase tracking-widest text-gold-ink">Join us</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Careers at Sambal &amp; Sakura</h1>
        <p className="mt-3 text-muted-foreground text-pretty">
          We&apos;re a warm, busy kitchen bringing authentic Chinese and Japanese food to Middlesbrough. If you love great food and great service, we&apos;d love to hear from you.
        </p>
      </header>

      {jobs.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No open roles right now - but we&apos;re always happy to hear from great people. Email{" "}
          <a href={`mailto:${b.email}`} className="font-medium text-gold-ink hover:underline">{b.email}</a>.
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-5">
          {jobs.map((j) => (
            <article key={j.id} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-2xl font-bold"><Briefcase className="size-5 text-gold-ink" /> {j.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="gap-1"><Clock className="size-3" /> {j.type}</Badge>
                    <Badge variant="outline" className="gap-1"><MapPin className="size-3" /> {j.location}</Badge>
                  </div>
                </div>
                <Button asChild className="h-11 gap-2 font-semibold">
                  <a href={`mailto:${b.email}?subject=${encodeURIComponent("Application: " + j.title)}`}><Mail className="size-4" /> Apply</a>
                </Button>
              </div>
              <p className="mt-3 font-medium">{j.summary}</p>
              <p className="mt-2 text-muted-foreground text-pretty">{j.description}</p>
            </article>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        To apply, email your CV to{" "}
        <a href={`mailto:${b.email}`} className="font-medium text-gold-ink hover:underline">{b.email}</a>{" "}
        or call <a href={telHref(b.phone)} className="font-medium text-gold-ink hover:underline">{b.phone}</a>.
      </div>
    </div>
  );
}
