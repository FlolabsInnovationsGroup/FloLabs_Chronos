import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In | Chronos" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
