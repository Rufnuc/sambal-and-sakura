import { NextResponse } from "next/server";
import { z } from "zod";
import { adminUser } from "@/server/auth";
import { translateBatch, translationConfigured } from "@/server/translate";

// Owner-only: machine-translate a draft offer email so the owner (or their translator) can check
// and edit it before sending. Paragraph by paragraph, through the site's translation service.
const schema = z.object({ locale: z.enum(["zh", "vi", "ja"]), subject: z.string().trim().min(1).max(150), body: z.string().trim().min(1).max(5000) });

export async function POST(req: Request) {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!translationConfigured()) return NextResponse.json({ error: "Translation isn't set up (Google Translate key)." }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write the English subject and message first." }, { status: 400 });
  const { locale, subject, body } = parsed.data;
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const map = await translateBatch([subject, ...paras], locale);
  return NextResponse.json({ subject: map[subject] ?? subject, body: paras.map((p) => map[p] ?? p).join("\n\n") });
}
