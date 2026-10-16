import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLegalDoc, isLegalSlug, LEGAL_META, LEGAL_SLUGS, type Block } from "@/server/legal";

// Live numbers (cancel policy, referral amounts, retention, which providers are on) come from the
// database, so this page is rendered on request.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return { title: "Page not found", robots: { index: false } };
  const m = LEGAL_META[slug];
  return { title: m.title, description: m.summary, alternates: { canonical: `/legal/${slug}` } };
}

// "**bold**" and "[text](href)" inside legal text. Only site paths, https, mailto and tel links.
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
        const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
        if (m && /^(\/|https:\/\/|mailto:|tel:)/.test(m[2])) {
          const cls = "font-medium text-gold-ink underline-offset-2 hover:underline";
          return m[2].startsWith("/")
            ? <Link key={i} href={m[2]} className={cls}>{m[1]}</Link>
            : <a key={i} href={m[2]} className={cls} {...(m[2].startsWith("https") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{m[1]}</a>;
        }
        return p;
      })}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  if (typeof b === "string") return <p className="text-muted-foreground text-pretty"><Rich text={b} /></p>;
  if ("list" in b) {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground marker:text-gold-ink">
        {b.list.map((li, i) => <li key={i} className="text-pretty"><Rich text={li} /></li>)}
      </ul>
    );
  }
  // Wide tables scroll inside their own box on phones, never the whole page.
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead className="bg-muted/60">
          <tr>{b.table.head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {b.table.rows.map((row, i) => (
            <tr key={i} className="border-t border-border align-top">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 text-muted-foreground"><Rich text={cell} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Own-property check: slugs like "__proto__" or "constructor" must 404, not crash.
  if (!isLegalSlug(slug)) notFound();
  const doc = await getLegalDoc(slug);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-sm text-muted-foreground">Last updated {doc.updated}</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">{doc.title}</h1>
      <p className="mt-4 text-lg text-muted-foreground text-pretty">{doc.summary}</p>

      {doc.sections.length > 4 && (
        <nav aria-label="On this page" className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-semibold">On this page</p>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="text-muted-foreground hover:text-gold-ink hover:underline">{s.h}</a></li>
            ))}
          </ol>
        </nav>
      )}

      <div className="mt-8 flex flex-col gap-8">
        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="font-display text-xl font-bold">{s.h}</h2>
            <div className="mt-2 flex flex-col gap-3">
              {s.body.map((b, i) => <BlockView key={i} b={b} />)}
            </div>
          </section>
        ))}
      </div>

      <nav aria-label="Other legal pages" className="mt-12 border-t border-border pt-6 text-sm">
        <p className="font-semibold">Other legal pages</p>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_SLUGS.filter((s) => s !== slug).map((s) => (
            <li key={s}><Link href={`/legal/${s}`} className="text-gold-ink hover:underline">{LEGAL_META[s].title}</Link></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
