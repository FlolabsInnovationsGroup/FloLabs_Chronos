"use client";

import Image from "next/image";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
      } else {
        router.push("/timer");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-10 flex flex-col items-center">
          <Image src="/flchron-logo.svg" alt="FloLabs Chronos" width={180} height={42} priority className="h-10 w-auto mb-4" />
          <p
            className="text-sm text-on-surface-variant"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Sign in to track your time
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-xl paper-shadow p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full px-3 py-2.5 text-sm text-on-background bg-surface-container-low rounded-lg outline-none placeholder:text-outline-variant focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 text-sm text-on-background bg-surface-container-low rounded-lg outline-none placeholder:text-outline-variant focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              />
            </div>

            {error && (
              <p
                className="text-sm text-error bg-warm-surface px-3 py-2 rounded-lg"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-medium rounded-md bg-primary text-on-primary hover:bg-primary-dim active:brightness-95 disabled:opacity-50 transition-colors cursor-pointer"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <Link
              href="/register?forgot=1"
              className="text-sm text-primary hover:underline text-center"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Forgot your password?
            </Link>
          </form>
        </div>

        {/* Register link */}
        <p
          className="text-center text-sm text-on-surface-variant mt-6"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
