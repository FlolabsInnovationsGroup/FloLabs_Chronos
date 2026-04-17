"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = true,
  minLength,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  minLength?: number;
  autoFocus?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          autoFocus={autoFocus}
          className="w-full px-3 py-2.5 pr-20 text-sm text-on-background bg-surface-container-low rounded-lg outline-none placeholder:text-outline-variant focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        />
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          className="absolute inset-y-1.5 right-1.5 inline-flex items-center rounded-md px-3 text-xs font-medium text-primary hover:bg-surface-container"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={revealed}
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";
  const resetToken = searchParams.get("reset") ?? "";
  const forgotMode = searchParams.get("forgot") === "1";

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const needsPasswordSetup = !forgotMode;
  const isResetFlow = Boolean(resetToken);

  useEffect(() => {
    let cancelled = false;

    async function loadInvitation() {
      setError("");
      setStatusMessage("");

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
            const payload = data as { reset?: { name?: string; email?: string } };
            setName(payload.reset?.name ?? "");
            setEmail(payload.reset?.email ?? "");
          }
        } catch {
          if (!cancelled) setError("Could not validate this reset link.");
        } finally {
          if (!cancelled) setLoadingInvite(false);
        }
        return;
      }

      if (inviteToken) {
        try {
          const res = await fetch(`/api/auth/invitation?token=${encodeURIComponent(inviteToken)}`);
          const data = (await res.json()) as { error?: string };
          if (!cancelled) {
            setError(
              typeof data.error === "string" && data.error.trim()
                ? data.error
                : "Invitation links are no longer used. Sign in with the account your team provisioned.",
            );
          }
        } catch {
          if (!cancelled) setError("Could not validate this link.");
        } finally {
          if (!cancelled) setLoadingInvite(false);
        }
        return;
      }

      setLoadingInvite(false);
    }

    void loadInvitation();

    return () => {
      cancelled = true;
    };
  }, [forgotMode, inviteToken, resetToken]);

  const showAccountHelp = !forgotMode && !resetToken && !loadingInvite;
  const showPasswordForm = !loadingInvite && (forgotMode || resetToken);
  const passwordsReady = !needsPasswordSetup || (password.length >= 8 && password === confirmPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatusMessage("");

    if (!forgotMode && !resetToken) {
      setError("Sign in if you already have an account, or use Forgot password on the login page.");
      return;
    }

    if (needsPasswordSetup && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (needsPasswordSetup && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = forgotMode ? "/api/auth/forgot-password" : "/api/auth/reset-password";
      const payload = forgotMode
        ? { email: email.toLowerCase().trim() }
        : { token: resetToken, password };

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
        setStatusMessage("Reset email sent. Check your inbox.");
        return;
      }

      const result = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(
          isResetFlow
            ? "Password updated, but login failed. Please sign in manually."
            : "Account created, but login failed. Please sign in manually."
        );
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <Image src="/flchron-logo.svg" alt="FloLabs Chronos" width={180} height={42} priority className="h-10 w-auto" />
          </div>
          <p
            className="text-sm text-on-surface-variant mt-2"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {forgotMode
              ? "Reset your password"
              : resetToken
                ? "Choose a new password"
                : inviteToken
                  ? "This link is no longer valid"
                  : "Get access to your account"}
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl paper-shadow p-8">
          {loadingInvite ? (
            <div className="flex flex-col gap-3">
              <div className="h-4 rounded bg-surface-container-low animate-pulse" />
              <div className="h-4 rounded bg-surface-container-low animate-pulse w-4/5" />
              <div className="h-10 rounded-xl bg-surface-container-low animate-pulse mt-4" />
            </div>
          ) : showAccountHelp ? (
            <div className="flex flex-col gap-4">
              <p
                className="text-sm text-on-surface-variant"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Chronos accounts are provisioned when someone reaches the Joined stage in FloLabs / Hephaestus. If you were onboarded, sign in with the email and password your team set up. Use Forgot password on the login page if you need to reset it.
              </p>
              {error && (
                <p
                  className="text-sm text-error bg-warm-surface px-3 py-2 rounded-lg"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {error}
                </p>
              )}
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 text-sm font-medium rounded-md bg-primary text-on-primary hover:bg-primary-dim transition-colors"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Go to sign in
              </Link>
            </div>
          ) : showPasswordForm ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {!forgotMode && (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="name"
                    className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
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
                    readOnly={Boolean(resetToken)}
                    className={`w-full px-3 py-2.5 text-sm rounded-lg outline-none placeholder:text-outline-variant transition-all ${resetToken ? "text-on-surface-variant bg-surface-container" : "text-on-background bg-surface-container-low focus:bg-background focus:ring-2 focus:ring-primary/20"}`}
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  />
                </div>
              )}

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
                  readOnly={!forgotMode}
                  autoFocus={forgotMode}
                  placeholder="you@example.com"
                  className={`w-full px-3 py-2.5 text-sm rounded-lg outline-none ${forgotMode ? "text-on-background bg-surface-container-low placeholder:text-outline-variant focus:bg-background focus:ring-2 focus:ring-primary/20" : "text-on-surface-variant bg-surface-container"}`}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                />
              </div>

              {needsPasswordSetup && (
                <>
                  <PasswordField
                    id="password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="At least 8 characters"
                    minLength={8}
                    autoFocus={false}
                  />
                  <PasswordField
                    id="confirm-password"
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Repeat your password"
                  />
                </>
              )}

              {error && (
                <p
                  className="text-sm text-error bg-warm-surface px-3 py-2 rounded-lg"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {error}
                </p>
              )}

              {statusMessage && (
                <p
                  className="text-sm text-primary bg-success-tint px-3 py-2 rounded-lg"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {statusMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || (needsPasswordSetup && !passwordsReady && password.length > 0 && confirmPassword.length > 0)}
                className="w-full py-2.5 px-4 text-sm font-medium rounded-md bg-primary text-on-primary hover:bg-primary-dim active:brightness-95 disabled:opacity-50 transition-colors cursor-pointer"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {loading
                  ? forgotMode
                    ? "Sending reset link..."
                    : "Resetting password..."
                  : forgotMode
                    ? "Send reset link"
                    : "Reset password"}
              </button>
            </form>
          ) : null}
        </div>

        <p
          className="text-center text-sm text-on-surface-variant mt-6"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="w-full max-w-sm flex flex-col gap-3">
            <div className="h-4 rounded bg-surface-container-low animate-pulse" />
            <div className="h-4 rounded bg-surface-container-low animate-pulse w-4/5" />
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
