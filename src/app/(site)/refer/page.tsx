import { redirect } from "next/navigation";
export default function ReferRedirect() {
  redirect("/offers?tab=refer");
}
