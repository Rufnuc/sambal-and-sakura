import { buildFacts } from "@/server/facts";
import { RESTAURANT } from "@/lib/data/site";

/**
 * Plain-language "at a glance" facts, built from the live admin-edited data. Visible to customers and
 * written as simple sentences so search engines and AI assistants can quote them accurately.
 */
export async function KeyFacts({ hide = [] }: { hide?: string[] } = {}) {
  const { summary, facts: all } = await buildFacts();
  const facts = all.filter((f) => !hide.includes(f.label)); // e.g. the contact page shows delivery its own way
  return (
    <section id="key-facts" className="mt-16 scroll-mt-24">
      <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{RESTAURANT.name} at a glance</h2>
      <p className="mt-3 max-w-3xl text-muted-foreground">{summary}</p>
      <dl className="mt-6 grid max-w-4xl grid-cols-1 gap-x-8 gap-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-[11rem_1fr] sm:p-6">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.5 sm:contents">
            <dt className="font-semibold">{f.label}</dt>
            <dd className="min-w-0 text-muted-foreground sm:mb-0">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
