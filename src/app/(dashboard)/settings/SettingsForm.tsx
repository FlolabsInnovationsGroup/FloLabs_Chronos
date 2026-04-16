"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useChronosTheme } from "@/components/theme/ChronosThemeProvider";
import type { ChronosThemeMode } from "@/lib/chronos-theme";

interface SettingsFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    profilePictureUrl?: string | null;
  };
}

const THEME_SELECT_OPTIONS = [
  { value: "system", label: "System (match device)" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function SettingsForm({ user }: SettingsFormProps) {
  const { update: updateSession } = useSession();
  const { mode, setMode, mounted: themeMounted } = useChronosTheme();
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

  const [profilePictureUrl, setProfilePictureUrl] = useState(user.profilePictureUrl ?? "");
  const [pictureLoading, setPictureLoading] = useState(false);
  const [pictureError, setPictureError] = useState("");

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

  async function handlePictureUpload(file: File) {
    setPictureLoading(true);
    setPictureError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploadRes = await fetch("/api/settings/profile-picture", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        setPictureError(uploadData.error ?? "Failed to upload profile picture");
        return;
      }

      const saveRes = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilePictureUrl: uploadData.profilePictureUrl }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setPictureError(saveData.error ?? "Failed to save profile picture");
        return;
      }
      setProfilePictureUrl(uploadData.profilePictureUrl);
      await updateSession();
    } catch {
      setPictureError("Network error");
    } finally {
      setPictureLoading(false);
    }
  }

  async function handleRemovePicture() {
    setPictureLoading(true);
    setPictureError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilePictureUrl: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPictureError(data.error ?? "Failed to remove profile picture");
        return;
      }
      setProfilePictureUrl("");
      await updateSession();
    } catch {
      setPictureError("Network error");
    } finally {
      setPictureLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
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
            Light, dark, or match your device. Saved only on this browser.
          </p>
        </div>
        <div className="w-full sm:w-64 shrink-0">
          <Select
            id="settings-appearance-theme"
            label="Theme"
            options={[...THEME_SELECT_OPTIONS]}
            value={themeMounted ? mode : undefined}
            onChange={(v) => setMode(v as ChronosThemeMode)}
            placeholder={themeMounted ? undefined : "Loading…"}
            disabled={!themeMounted}
          />
        </div>
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

        <div className="flex flex-col gap-3">
          <p
            className="text-sm text-on-surface-variant"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Profile picture
          </p>
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 overflow-hidden rounded-full bg-surface-container-low">
              {profilePictureUrl ? (
                <img src={profilePictureUrl} alt="Profile picture preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-on-surface-variant">
                  No photo
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-outline px-3 py-1.5 text-sm text-on-background hover:bg-surface-container-low">
                Upload
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={pictureLoading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void handlePictureUpload(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {profilePictureUrl && (
                <Button type="button" variant="secondary" size="sm" disabled={pictureLoading} onClick={() => void handleRemovePicture()}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          {pictureLoading && (
            <p className="text-sm text-on-surface-variant" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
              Updating picture…
            </p>
          )}
          {pictureError && (
            <p className="text-sm text-error" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
              {pictureError}
            </p>
          )}
        </div>
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
