"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";

interface InvitationPayload {
  id: string;
  email: string;
  name: string;
  role: "team_lead" | "member";
  teamId: string;
  team?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

interface ResetPayload {
  email: string;
  name: string;
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";
  const resetToken = searchParams.get("reset") ?? "";
  const forgotMode = searchParams.get("forgot") === "1";

  const [invitation, setInvitation] = useState<InvitationPayload | null>(null);
  const [reset, setReset] = useState<ResetPayload | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInvitation() {
      if (forgotMode) {
        setLoadingInvite(false);
        return;
      }

      if (resetToken) {
        try {
          const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(resetToken)}`);
          const data = await res.json();
          if (!res.ok) {
            if (!cancelled) setError(data.error ?? "This reset link is not valid.");
            return;
          }
          if (!cancelled) {
            setReset(data.reset);
            setName(data.reset.name ?? "");
            setEmail(data.reset.email ?? "");
          }
        } catch {
          if (!cancelled) setError("Could not validate this reset link.");
        } finally {
          if (!cancelled) setLoadingInvite(false);
        }
        return;
      }

      if (!inviteToken) {
        setLoadingInvite(false);
        return;
      }

      try {
        const res = await fetch(`/api/auth/invitation?token=${encodeURIComponent(inviteToken)}`);
        const data = await res.json();

        if (!res.ok) {
          if (!cancelled) {
            setError(data.error ?? "This invitation is not valid.");
            setInvitation(null);
          }
          return;
        }

        if (!cancelled) {
          setInvitation(data.invitation);
          setName(data.invitation.name ?? "");
          setEmail(data.invitation.email ?? "");
        }
      } catch {
        if (!cancelled) {
          setError("Could not validate this invitation.");
        }
      } finally {
        if (!cancelled) {
          setLoadingInvite(false);
        }
      }
    }

    void loadInvitation();

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!forgotMode && !resetToken && (!invitation || !inviteToken)) {
      setError("A valid invitation is required.");
      return;
    }

    if (!forgotMode && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = forgotMode ? "/api/auth/forgot-password" : resetToken ? "/api/auth/reset-password" : "/api/auth/register";
      const payload = forgotMode
        ? { email: email.toLowerCase().trim() }
        : resetToken
          ? { token: resetToken, password }
          : { token: inviteToken, name: name.trim(), email: email.toLowerCase().trim(), password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }

      if (forgotMode) {
        setError("Reset email sent. Check your inbox.");
        return;
      }

      const result = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created, but login failed. Please sign in manually.");
        return;
      }

      router.push("/timer");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const invitationRequired = !forgotMode && !resetToken && !loadingInvite && !invitation;

  return (
    <div className="min-h-screen bg-[#fbf9f5] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
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
            {forgotMode ? "Reset your password" : resetToken ? "Choose a new password" : invitation ? "Accept your invitation" : "Invitation required"}
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl paper-shadow p-8">
          {loadingInvite ? (
            <div className="flex flex-col gap-3">
              <div className="h-4 rounded bg-[#f5f4ef] animate-pulse" />
              <div className="h-4 rounded bg-[#f5f4ef] animate-pulse w-4/5" />
              <div className="h-10 rounded-xl bg-[#f5f4ef] animate-pulse mt-4" />
            </div>
          ) : invitationRequired ? (
            <div className="flex flex-col gap-4">
              <p
                className="text-sm text-[#5e605b]"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Chronos accounts are created from an invitation link. Ask an admin to invite you, or sign in if your account already exists.
              </p>
              {error && (
                <p
                  className="text-sm text-[#a73b21] bg-[#fff7f6] px-3 py-2 rounded-lg"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {error}
                </p>
              )}
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 text-sm font-medium rounded-md bg-[#366769] text-[#e3feff] hover:bg-[#295a5d] transition-colors"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Go to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {!forgotMode && !resetToken && <div className="rounded-xl bg-[#f5f4ef] p-4">
                <p
                  className="text-xs font-medium uppercase tracking-wide text-[#5e605b]"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Invitation
                </p>
                <p
                  className="text-sm text-[#31332f] mt-1"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {invitation?.team?.name ?? "Assigned team"} · {invitation?.role === "team_lead" ? "Team Lead" : "Member"}
                </p>
              </div>}

              {!forgotMode && (
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
              )}

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
                  readOnly={!forgotMode}
                  autoFocus={forgotMode}
                  placeholder="you@example.com"
                  className={`w-full px-3 py-2.5 text-sm rounded-lg outline-none ${forgotMode ? "text-[#31332f] bg-[#f5f4ef] placeholder:text-[#b2b2ad] focus:bg-[#fbf9f5] focus:ring-2 focus:ring-[#366769]/20" : "text-[#5e605b] bg-[#efeee9]"}`}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                />
              </div>

              {!forgotMode && (
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
              )}

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
                {loading ? (forgotMode ? "Sending reset link..." : resetToken ? "Resetting password..." : "Creating account...") : forgotMode ? "Send reset link" : resetToken ? "Reset password" : "Create account"}
              </button>
            </form>
          )}
        </div>

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

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fbf9f5] flex items-center justify-center px-4">
        <div className="w-full max-w-sm flex flex-col gap-3">
          <div className="h-4 rounded bg-[#f5f4ef] animate-pulse" />
          <div className="h-4 rounded bg-[#f5f4ef] animate-pulse w-4/5" />
        </div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
