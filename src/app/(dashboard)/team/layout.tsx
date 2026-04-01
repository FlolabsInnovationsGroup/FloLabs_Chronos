import type { Metadata } from "next";

export const metadata: Metadata = { title: "Teams | FloLabs Chronos" };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
