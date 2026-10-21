import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { zText, zEmail, zPhoneText, zId } from "@/server/sanitize";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { verifyHuman } from "@/server/turnstile";
import { sendTransactional, emailConfigured } from "@/server/email";
import { esc } from "@/server/email-templates";
import { getCareers } from "@/server/config";
import { getSiteContent } from "@/server/site-content";
import { isPlausiblePhone } from "@/server/phone";
import { log } from "@/server/log";

// Job application from the Careers page: the CV is emailed to the restaurant's address (Site content
// -> email, or CAREERS_EMAIL) as an attachment, with Reply-To set to the applicant. Nothing is stored
// on the website (privacy: the owner's mailbox is the only copy). Multipart upload, same-origin only
// (src/proxy.ts), bot-checked and rate limited.

const MAX_CV_BYTES = 4 * 1024 * 1024; // the email provider's attachment limit
const KINDS: { ext: string; type: string; magic: number[] }[] = [
  { ext: "pdf", type: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },                                                    // %PDF
  { ext: "docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [0x50, 0x4b, 0x03, 0x04] }, // zip
  { ext: "doc", type: "application/msword", magic: [0xd0, 0xcf, 0x11, 0xe0] },                                                  // OLE
];

const fields = z.object({
  name: zText(80, { min: 2 }),
  email: zEmail,
  phone: zPhoneText.refine(isPlausiblePhone, "Please enter a valid phone number."),
  jobId: z.union([zId(40), z.literal("")]).optional(),
  message: zText(1500, { multiline: true }).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

// Applications per day, whole site: a backstop against floods of applications. Kept high so one person
// can't use it up and block real applicants (per-connection and per-mailbox limits do the everyday work,
// and careers emails can't touch the order-email reserve). Positive whole numbers only.
const CV_PER_DAY = Math.max(1, Math.floor(Number(process.env.CAREERS_DAILY_LIMIT))) || 100;

/** One key per real inbox: lower-case, "+tag" removed, and dots ignored for Gmail. */
function mailboxKey(email: string): string {
  const [local, domain = ""] = email.toLowerCase().split("@");
  const base = local.split("+")[0];
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  return `${gmail ? base.replace(/\./g, "") : base}@${gmail ? "gmail.com" : domain}`;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limited = await limitOr429([
    { name: "cv-ip-hour", id: ip, limit: 6, windowSec: 3600 },
    { name: "cv-ip-day", id: ip, limit: 15, windowSec: 86400 },
  ], "Too many applications from this connection. Please try again tomorrow, or email us your CV.");
  if (limited) return limited;

  const { business: b } = await getSiteContent();
  const to = process.env.CAREERS_EMAIL || b.email;
  if (!emailConfigured() || !to) {
    return NextResponse.json({ error: `Online applications aren't available right now. Please email your CV to ${b.email}.` }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Please fill in the form and attach your CV." }, { status: 400 });
  const parsed = fields.safeParse({
    name: form.get("name") ?? "", email: form.get("email") ?? "", phone: form.get("phone") ?? "",
    jobId: form.get("jobId") ?? "", message: form.get("message") ?? "", turnstileToken: form.get("turnstileToken") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  const d = parsed.data;
  if (form.get("consent") !== "yes") return NextResponse.json({ error: "Please confirm you've read how we use your application." }, { status: 400 });
  if (!(await verifyHuman(d.turnstileToken, ip))) return NextResponse.json({ error: "Please complete the check and try again." }, { status: 400 });

  const file = form.get("cv");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Please attach your CV (PDF or Word)." }, { status: 400 });
  if (file.size > MAX_CV_BYTES) return NextResponse.json({ error: "That file is too big. Please send a CV under 4 MB (PDF works best)." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = KINDS.find((k) => k.magic.every((m, i) => bytes[i] === m));
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  // The real file contents must match (not just the name): stops renamed executables or scripts.
  if (!kind || kind.ext !== ext) {
    return NextResponse.json({ error: "Please attach your CV as a PDF or Word document (.pdf, .doc or .docx)." }, { status: 400 });
  }

  // Counted only once the application is otherwise valid (a broken request can't use up someone's
  // allowance), and per MAILBOX: "name+anything@" and Gmail's dotted spellings are the same inbox.
  // Plus a site-wide daily cap, so a flood of applications can't swamp the restaurant's inbox and email budget.
  const limitedAfterChecks = await limitOr429([
    { name: "cv-email-day", id: mailboxKey(d.email), limit: 3, windowSec: 86400 },
    { name: "cv-all-day", id: "all", limit: CV_PER_DAY, windowSec: 86400 },
  ], "We've received a lot of applications today. Please try again tomorrow, or email us your CV.");
  if (limitedAfterChecks) return limitedAfterChecks;

  const job = d.jobId ? (await getCareers()).find((j) => j.id === d.jobId && j.active) : undefined;
  const role = job?.title ?? "General application";
  const safeName = d.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 40) || "applicant";
  const attachmentName = `CV-${safeName}.${kind.ext}`;

  const rows: [string, string][] = [["Role", role], ["Name", d.name], ["Email", d.email], ["Phone", d.phone]];
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1b1812">
<h2 style="margin:0 0 12px">New job application: ${esc(role)}</h2>
<table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join("")}</table>
${d.message ? `<p style="margin:16px 0 4px;color:#666">Message</p><p style="white-space:pre-wrap;margin:0">${esc(d.message)}</p>` : ""}
<p style="margin-top:20px;color:#666;font-size:13px">The CV is attached (${esc(attachmentName)}). Reply to this email to answer ${esc(d.name)} directly.
It was sent through the Careers page and is not stored on the website. Please delete it within 6 months if you don't hire them (see the Privacy Policy).</p></div>`;
  const text = `New job application: ${role}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n${d.message ? `\nMessage:\n${d.message}\n` : ""}\nCV attached: ${attachmentName}. Reply to this email to answer the applicant.`;

  const ok = await sendTransactional("careers-application", `careers:${randomUUID()}`, {
    to: { email: to }, subject: `Job application: ${role} - ${d.name}`, html, text,
    replyTo: { email: d.email, name: d.name },
    attachments: [{ name: attachmentName, content: bytes.toString("base64") }],
  });
  if (!ok) return NextResponse.json({ error: `Sorry, we couldn't send that just now. Please email your CV to ${b.email}.` }, { status: 502 });

  // Short receipt for the applicant (no attachment). The address is typed, not verified, so the receipt carries
  // nothing the sender chose (no name, no message): it can't be used to send someone else words from our domain.
  void sendTransactional("careers-receipt", `careers-receipt:${randomUUID()}`, {
    to: { email: d.email },
    subject: "We've received your application - Sambal & Sakura",
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1b1812"><p>Hello,</p><p>Thanks for applying${job ? ` for <strong>${esc(role)}</strong>` : ""}. We've received your CV and will get back to you if your application is a good fit.</p><p>If you didn't apply, you can ignore this email: nothing else will be sent to you.</p><p>Sambal &amp; Sakura</p></div>`,
    text: `Hello,\n\nThanks for applying${job ? ` for ${role}` : ""}. We've received your CV and will get back to you if your application is a good fit.\n\nIf you didn't apply, you can ignore this email: nothing else will be sent to you.\n\nSambal & Sakura`,
  });

  log.info("careers_application", { role, bytes: file.size, type: kind.ext });
  return NextResponse.json({ ok: true });
}
