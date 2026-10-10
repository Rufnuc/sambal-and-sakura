import { redirect } from "next/navigation";
export default function ReferRedirect() {
  redirect("/offers"); // referral rewards aren't live yet (see FEATURES in lib/data/site.ts)
}
