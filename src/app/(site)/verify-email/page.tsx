import type { Metadata } from "next";
import { VerifyEmail } from "@/components/account/email-link-pages";

// Opened from the "confirm your email" message sent after sign-up.
export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

export default function VerifyEmailPage() {
  return <VerifyEmail />;
}
