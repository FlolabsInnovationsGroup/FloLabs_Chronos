import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users | FloLabs Chronos" };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
