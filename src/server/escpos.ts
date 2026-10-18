// Minimal ESC/POS builder for the 80mm kitchen printer (Xprinter XP-E260M). Standard commands only:
// init, align, bold, reverse, size, feed, cut.
//
// Text encoding: Xprinter's Chinese firmware prints in "Chinese mode" (GB18030 / GBK double-byte), not UTF-8.
// Chinese characters are sent as GBK; plain English stays ASCII; accented letters (e.g. Vietnamese names)
// lose their accents so they still print at the expected width; "£" is printed from the printer's
// single-byte code page (FS . leaves Chinese mode, ESC t 0 selects PC437 where £ = 0x9C, FS & goes back).
import iconv from "iconv-lite";

export const COLS = 48; // characters per line in the normal font on 80mm paper (576 dots / 12)

/** Terminal columns a character takes: CJK / fullwidth = 2, combining marks = 0, everything else = 1. */
export function charWidth(cp: number): number {
  if (cp >= 0x0300 && cp <= 0x036f) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) return 2;
  return 1;
}

/** Keep printable text only: drop control characters, replace emoji / astral symbols the printer can't draw. */
export function clean(s: string): string {
  return Array.from(s.replace(/[\u0000-\u001f\u007f]/g, " "))
    .map((c) => ((c.codePointAt(0) ?? 0) > 0xffff ? "?" : c))
    .join("");
}

export function displayWidth(s: string): number {
  let w = 0;
  for (const c of s) w += charWidth(c.codePointAt(0) ?? 0);
  return w;
}

/** Word-wrap to a display width (hard-splits words longer than a line). */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    const push = () => { if (line) { out.push(line); line = ""; } };
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (displayWidth(w) > width) {
        let cut = ""; for (const c of w) { if (displayWidth(cut + c) > width) break; cut += c; }
        push(); out.push(cut); w = w.slice(cut.length);
      }
      if (!line) line = w;
      else if (displayWidth(line + " " + w) <= width) line += " " + w;
      else { push(); line = w; }
    }
    push();
    if (!para.trim()) out.push("");
  }
  return out.length ? out : [""];
}

/** `left` ... `right` on one line of `width` columns (left is truncated if too long). */
export function padLine(left: string, right: string, width = COLS): string {
  const r = clean(right);
  let l = clean(left);
  const room = width - displayWidth(r) - (r ? 1 : 0);
  while (displayWidth(l) > room) l = Array.from(l).slice(0, -1).join("");
  return l + " ".repeat(Math.max(0, width - displayWidth(l) - displayWidth(r))) + r;
}

/** Printer bytes for one already-cleaned line of text (see the encoding note at the top). */
export function encodeText(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    if (cp < 0x80) { out.push(cp); continue; }
    if (ch === "£") { out.push(0x1c, 0x2e, 0x1b, 0x74, 0x00, 0x9c, 0x1c, 0x26); continue; }
    if (charWidth(cp) === 2) {
      const b = iconv.encode(ch, "gb18030");
      if (b.length === 2) { out.push(...b); continue; } // in GBK: prints as one wide character
      out.push(0x3f, 0x3f); continue;                    // keep the 2-column width the layout counted
    }
    // Narrow non-ASCII (é, ễ, ü, curly quotes...): the letter without its accent, else "?".
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const ascii = { "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u2026": "." }[ch];
    out.push(...(ascii ?? (base.length === 1 && base.charCodeAt(0) < 0x80 ? base : "?")).split("").map((c) => c.charCodeAt(0)));
  }
  return out;
}

export class Esc {
  private bytes: number[] = [];

  private raw(...b: number[]) { this.bytes.push(...b); return this; }

  /** ESC @ (reset) + ESC 2 (default line spacing) + FS & (Chinese mode, so GBK text prints). */
  init() { return this.raw(0x1b, 0x40, 0x1b, 0x32, 0x1c, 0x26); }
  align(a: "left" | "center" | "right") { return this.raw(0x1b, 0x61, { left: 0, center: 1, right: 2 }[a]); }
  bold(on: boolean) { return this.raw(0x1b, 0x45, on ? 1 : 0); }
  /** GS B n: white text on black. Used only for the payment block so customer text can't imitate it. */
  reverse(on: boolean) { return this.raw(0x1d, 0x42, on ? 1 : 0); }
  /** GS ! n: width/height multiplier 1-4. */
  size(w = 1, h = 1) { return this.raw(0x1d, 0x21, ((Math.min(4, w) - 1) << 4) | (Math.min(4, h) - 1)); }
  /** Text then a line feed (encoded for the printer, see encodeText). */
  line(text = "") { this.bytes.push(...encodeText(clean(text)), 0x0a); return this; }
  feed(n: number) { return this.raw(0x1b, 0x64, Math.min(255, n)); }
  rule(ch = "-") { return this.line(ch.repeat(COLS)); }
  /** GS V 66 0: feed to the cutter position then partial cut. */
  cut() { return this.raw(0x1d, 0x56, 0x42, 0x00); }

  toBuffer(): Buffer { return Buffer.from(this.bytes); }
}
