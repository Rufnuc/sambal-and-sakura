// Tells Bing (and the other IndexNow search engines: Yandex, Seznam, Naver) that the public pages
// exist or have changed, so they are crawled within hours instead of weeks. Bing's index is what
// ChatGPT search, Microsoft Copilot and DuckDuckGo answer from. Google does not use IndexNow: use
// Search Console for Google.
//
// Run after a deploy that changes public pages (new menu, hours, offers...):  npm run indexnow
// The key is public by design (it only proves the request comes from the site's owner); its file
// is served from public/ at https://www.sambalandsakura.co.uk/<key>.txt.

const SITE = (process.env.SITE_URL || "https://www.sambalandsakura.co.uk").replace(/\/+$/, "");
const KEY = "0ed1558c30a2ce68dbd41b05f1dfda3e";

// The page list comes from the live sitemap, so it always matches what search engines are told.
const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
if (!urlList.length) throw new Error("No pages found in the sitemap");

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
});
// 200 = accepted, 202 = accepted (key check pending). 403 = the key file isn't live yet (deploy first).
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} pages`);
if (res.status >= 300) process.exitCode = 1;
