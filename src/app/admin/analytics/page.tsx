import { AnalyticsView } from "@/components/admin/analytics-view";
import { requireSectionPage } from "@/server/admin-page";

export default async function AdminAnalyticsPage() {
  await requireSectionPage("analytics");
  return <AnalyticsView />;
}
