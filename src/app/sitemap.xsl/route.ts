import { RESTAURANT } from "@/lib/data/site";

const NAME = RESTAURANT.name.replace(/&/g, "&amp;").replace(/</g, "&lt;"); // XML-escaped ("Sambal & Sakura")

// Browser view of sitemap.xml: turns the list of addresses into a small branded page.
// Search engines never use this file.
const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Sitemap · ${NAME}</title>
<style>
  :root { color-scheme: light dark; --bg:#faf7f2; --card:#fff; --ink:#1c1915; --muted:#6b645a; --line:#e8e1d6; --gold:#9a6b14; --row:#f6f1e8; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141210; --card:#1c1915; --ink:#f3eee6; --muted:#a39a8d; --line:#2e2a24; --gold:#e0a83e; --row:#221f1a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width:860px; margin:0 auto; padding:40px 16px 64px; }
  .eyebrow { margin:0; color:var(--gold); font-size:12px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; }
  h1 { margin:6px 0 8px; font-family: Georgia, "Times New Roman", serif; font-size:32px; line-height:1.15; }
  p.lead { margin:0 0 24px; color:var(--muted); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); padding:12px 16px; border-bottom:1px solid var(--line); }
  td { padding:12px 16px; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  tbody tr:hover td { background:var(--row); }
  td.n { width:44px; color:var(--muted); font-variant-numeric: tabular-nums; }
  a { color:var(--ink); text-decoration:none; word-break:break-all; }
  a:hover { color:var(--gold); text-decoration:underline; }
  .foot { margin-top:16px; font-size:13px; color:var(--muted); }
</style>
</head>
<body>
<main>
  <p class="eyebrow">${NAME}</p>
  <h1>Sitemap</h1>
  <p class="lead">The public pages of this website, for search engines. <xsl:value-of select="count(s:urlset/s:url)"/> pages.</p>
  <div class="card">
    <table>
      <thead><tr><th>#</th><th>Page</th></tr></thead>
      <tbody>
        <xsl:for-each select="s:urlset/s:url">
          <tr>
            <td class="n"><xsl:value-of select="position()"/></td>
            <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </div>
  <p class="foot">This is the XML sitemap (sitemaps.org format) that Google and other search engines read.</p>
</main>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
`;

export function GET() {
  return new Response(xsl, { headers: { "Content-Type": "text/xsl; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" } });
}
