import type { Metadata } from "next";
import { preconnect, preload } from "react-dom";
import "./fonts.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { RESTAURANT } from "@/lib/data/site";
import { getSiteContent } from "@/server/site-content";
import { SITE_URL } from "@/lib/site-url";
import { fitDescription } from "@/lib/seo";

// Fonts are our own files (src/app/fonts.css + public/fonts): nothing is fetched from Google, ever.
// The two used on every page start downloading straight away.
const PRELOAD_FONTS = ["/fonts/playfair-display-latin-v1.woff2", "/fonts/karla-latin-v1.woff2"];

// Pages render on request (each section sets dynamic = "force-dynamic"): the site shows admin-editable
// content (offers, hours, FAQ...), so nothing may be frozen at build time. The menu pages are the one
// exception: they are served from a ready-made copy that is rebuilt whenever the admin saves
// (server/menu-pages.ts). Don't set dynamic here - it would apply to the menu pages too.

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getSiteContent();
  // Brand name first, then what it is and where: this is what Google shows as the blue link text.
  const title = `${RESTAURANT.name} | Chinese, Japanese & Malaysian Restaurant in ${business.address.city}`;
  // Search engines show about 155 characters, so the meta description is written for that, not the
  // longer shop description (which stays on the page itself).
  const street = business.address.line1.replace(/^[\d\s\u2013-]+/, "") || business.address.city;
  const description = fitDescription(
    `${RESTAURANT.name}: Chinese, Japanese & Malaysian restaurant on ${street}, ${business.address.city}. Sushi, ramen, nasi lemak & more. Order online or book a table.`,
  );
  const verification = process.env.GOOGLE_SITE_VERIFICATION;
  const bingVerification = process.env.BING_SITE_VERIFICATION;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s · ${RESTAURANT.name}` },
    description,
    applicationName: RESTAURANT.name,
    openGraph: { title, description, type: "website", locale: "en_GB", siteName: RESTAURANT.name },
    icons: { icon: "/logo-mark.svg", apple: "/apple-icon" },
    ...(verification || bingVerification
      ? { verification: { ...(verification ? { google: verification } : {}), ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}) } }
      : {}),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Menu photos come from Cloudinary: open the connection while the page loads, not at the first photo.
  if (process.env.CLOUDINARY_CLOUD_NAME) preconnect("https://res.cloudinary.com", { crossOrigin: "anonymous" });
  for (const href of PRELOAD_FONTS) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full"
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster richColors position="top-center" duration={2500} />
        </Providers>
      </body>
    </html>
  );
}
