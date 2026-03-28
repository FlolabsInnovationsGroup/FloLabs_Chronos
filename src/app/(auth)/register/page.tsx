"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Registration failed.");
        return;
      }

      // Auto-sign in after registration
      const result = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created but login failed. Try signing in.");
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
    <div className="min-h-screen bg-[#fbf9f5] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-10">
          <h1
            className="text-4xl font-light italic text-[#31332f]"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            FloLabs Chronos
          </h1>
          <p
            className="text-sm text-[#5e605b] mt-2"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Create your account
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-lowest rounded-xl paper-shadow p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="name"
                className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                autoFocus
                className="w-full px-3 py-2.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none placeholder:text-[#b2b2ad] focus:bg-[#fbf9f5] focus:ring-2 focus:ring-[#366769]/20 transition-all"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
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
                className="w-full px-3 py-2.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none placeholder:text-[#b2b2ad] focus:bg-[#fbf9f5] focus:ring-2 focus:ring-[#366769]/20 transition-all"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="w-full px-3 py-2.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none placeholder:text-[#b2b2ad] focus:bg-[#fbf9f5] focus:ring-2 focus:ring-[#366769]/20 transition-all"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              />
            </div>

            {error && (
              <p
                className="text-sm text-[#a73b21] bg-[#fff7f6] px-3 py-2 rounded-lg"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-medium rounded-md bg-[#366769] text-[#e3feff] hover:bg-[#295a5d] active:bg-[#104648] disabled:opacity-50 transition-colors cursor-pointer"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        </div>

        {/* Login link */}
        <p
          className="text-center text-sm text-[#5e605b] mt-6"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Already have an account?{" "}
          <Link href="/login" className="text-[#366769] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
