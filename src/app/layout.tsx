import type { Metadata } from "next";
import { Playfair_Display, Karla } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { RESTAURANT } from "@/lib/data/site";
import { getSiteContent } from "@/server/site-content";

const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const body = Karla({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Every page renders on request: the site shows admin-editable content (menu, offers, hours, FAQ...),
// so nothing may be frozen at build time. Also means a first deploy never needs the database to build.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getSiteContent();
  const title = `${RESTAURANT.name} - ${business.tagline}`;
  return {
    metadataBase: new URL("https://sambalandsakura.co.uk"),
    title: { default: title, template: `%s · ${RESTAURANT.name}` },
    description: business.blurb,
    openGraph: { title, description: business.blurb, type: "website", locale: "en_GB" },
    icons: { icon: "/logo-mark.svg" },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} h-full`}
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
