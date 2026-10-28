import type { Metadata } from "next";
import { ResetPassword } from "@/components/account/email-link-pages";

// Opened from the password-reset email (the one-time token is after "#", so it never reaches the server log).
export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return <ResetPassword />;
}
