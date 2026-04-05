"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface SettingsFormProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export function SettingsForm({ user }: SettingsFormProps) {
  const [name, setName] = useState(user.name);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState("");

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    setNameLoading(true);
    setNameSuccess(false);
    setNameError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        setNameError(data.error ?? "Failed to update name");
      } else {
        setNameSuccess(true);
        setTimeout(() => setNameSuccess(false), 3000);
      }
    } catch {
      setNameError("Network error");
    } finally {
      setNameLoading(false);
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match");
      return;
    }
    setPwLoading(true);
    setPwSuccess(false);
    setPwError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPwError(data.error ?? "Failed to update password");
      } else {
        setPwSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPwSuccess(false), 3000);
      }
    } catch {
      setPwError("Network error");
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6 flex flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            className="text-base font-medium text-on-background"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Appearance
          </h2>
          <p
            className="text-sm text-on-surface-variant mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Light or dark theme (saved on this device)
          </p>
        </div>
        <ThemeToggle />
      </Card>

      {/* Profile info */}
      <Card className="p-6 flex flex-col gap-5">
        <div>
          <h2
            className="text-base font-medium text-on-background"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Profile
          </h2>
          <p
            className="text-sm text-on-surface-variant mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Update your display name
          </p>
        </div>

        {/* Email (read-only) */}
        <Input label="Email" value={user.email} disabled />

        <form onSubmit={handleNameSave} className="flex flex-col gap-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
            error={nameError || undefined}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="sm" loading={nameLoading}>
              Save name
            </Button>
            {nameSuccess && (
              <span
                className="text-sm text-primary"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Saved
              </span>
            )}
          </div>
        </form>
      </Card>

      {/* Password change */}
      <Card className="p-6 flex flex-col gap-5">
        <div>
          <h2
            className="text-base font-medium text-on-background"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Password
          </h2>
          <p
            className="text-sm text-on-surface-variant mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Change your account password
          </p>
        </div>

        <form onSubmit={handlePasswordSave} className="flex flex-col gap-4">
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            hint="Minimum 8 characters"
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            error={pwError || undefined}
            autoComplete="new-password"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="sm" loading={pwLoading}>
              Update password
            </Button>
            {pwSuccess && (
              <span
                className="text-sm text-primary"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Password updated
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card className="p-6 flex flex-col gap-4">
        <div>
          <h2
            className="text-base font-medium text-on-background"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Session
          </h2>
          <p
            className="text-sm text-on-surface-variant mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Sign out of your FloLabs Chronos account on this device
          </p>
        </div>

        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Log out
          </Button>
        </div>
      </Card>
    </div>
  );
}
