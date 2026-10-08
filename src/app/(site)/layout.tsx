import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileCtaBar } from "@/components/layout/mobile-cta-bar";
import { ConsentBanner } from "@/components/consent-banner";
import { SiteContentProvider } from "@/components/site-content-provider";
import { getSiteContent } from "@/server/site-content";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { business } = await getSiteContent();
  return (
    <SiteContentProvider content={{ business }}>
      <SiteHeader />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <SiteFooter />
      <MobileCtaBar />
      <ConsentBanner />
    </SiteContentProvider>
  );
}
