// The public address of the website, used for the sitemap, robots.txt, canonical links, social
// previews and Google structured data. Set SITE_URL in the host's environment (e.g. Render) to the
// address the site is ACTUALLY served from - first the onrender.com one, then the custom domain once
// it is connected. If this points somewhere the site isn't, Google ignores the sitemap and
// canonical links and the site is very hard to find.
export const SITE_URL = (process.env.SITE_URL || "https://sambalandsakura.co.uk").replace(/\/+$/, "");
