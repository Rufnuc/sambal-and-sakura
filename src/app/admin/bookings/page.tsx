import { BookingsView } from "@/components/admin/bookings-view";
import { requireSectionPage } from "@/server/admin-page";

export default async function AdminBookingsPage() {
  await requireSectionPage("bookings");
  return <BookingsView />;
}
