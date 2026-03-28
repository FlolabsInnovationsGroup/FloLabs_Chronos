"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import type { User, Role } from "@/types";

interface TeamUser extends User {
  discordWebhookUrl?: string;
  notifyOnStart?: boolean;
  notifyOnStop?: boolean;
  dailySummary?: boolean;
}

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

function InviteForm({ onSave, onCancel }: { onSave: (data: Partial<TeamUser>) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) { setError("All fields are required"); return; }
    setSaving(true);
    try {
      await onSave({ name, email, password, role } as Partial<TeamUser>);
    } catch {
      setError("Failed to invite member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input label="Full Name" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Email" type="email" placeholder="jane@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input label="Temporary Password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Select label="Role" options={ROLE_OPTIONS} value={role} onChange={(v) => setRole(v as Role)} />
      {error && <p className="text-sm text-[#a73b21]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" loading={saving}>Invite Member</Button>
      </div>
    </form>
  );
}

function EditUserForm({
  user,
  onSave,
  onCancel,
}: {
  user: TeamUser;
  onSave: (data: Partial<TeamUser>) => Promise<void>;
  onCancel: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [discordWebhook, setDiscordWebhook] = useState(user.discordWebhookUrl ?? "");
  const [notifyStart, setNotifyStart] = useState(user.notifyOnStart ?? false);
  const [notifyStop, setNotifyStop] = useState(user.notifyOnStop ?? false);
  const [dailySummary, setDailySummary] = useState(user.dailySummary ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        role,
        discordWebhookUrl: discordWebhook || undefined,
        notifyOnStart: notifyStart,
        notifyOnStop: notifyStop,
        dailySummary,
      });
    } catch {
      setError("Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3 pb-2">
        <div className="w-10 h-10 rounded-full bg-[#366769] flex items-center justify-center text-[#e3feff] font-semibold">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-[#31332f]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{user.name}</p>
          <p className="text-xs text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{user.email}</p>
        </div>
      </div>

      <Select label="Role" options={ROLE_OPTIONS} value={role} onChange={(v) => setRole(v as Role)} />

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-[#5e605b] uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
          Discord Webhook URL
        </label>
        <input
          type="url"
          value={discordWebhook}
          onChange={(e) => setDiscordWebhook(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="px-3 py-2.5 text-sm text-[#31332f] bg-[#f5f4ef] rounded-lg outline-none focus:ring-2 focus:ring-[#366769]/20 placeholder:text-[#b2b2ad]"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        />
      </div>

      {discordWebhook && (
        <div className="flex flex-col gap-2 bg-[#f5f4ef] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#5e605b] uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
            Discord Notifications
          </p>
          {[
            { label: "Notify on timer start", value: notifyStart, onChange: setNotifyStart },
            { label: "Notify on timer stop", value: notifyStop, onChange: setNotifyStop },
            { label: "Daily summary (5 PM)", value: dailySummary, onChange: setDailySummary },
          ].map(({ label, value, onChange }) => (
            <label key={label} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
                className="w-4 h-4 rounded accent-[#366769]"
              />
              <span className="text-sm text-[#31332f]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{label}</span>
            </label>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-[#a73b21]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" loading={saving}>Save Changes</Button>
      </div>
    </form>
  );
}

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser] = useState<TeamUser | null>(null);

  async function refreshUsers() {
    const res = await fetch("/api/users");
    const { users: data } = await res.json();
    setUsers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialUsers() {
      try {
        const res = await fetch("/api/users");
        const { users: data } = await res.json();
        if (!cancelled) setUsers(data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleInvite(data: Partial<TeamUser>) {
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setShowInvite(false);
    await refreshUsers();
  }

  async function handleEdit(data: Partial<TeamUser>) {
    await fetch(`/api/users/${editUser!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditUser(null);
    await refreshUsers();
  }

  async function handleDeactivate(user: TeamUser) {
    if (!confirm(`Deactivate ${user.name}? They will no longer be able to log in.`)) return;
    await fetch(`/api/users/${user.id}`, {
      method: "DELETE",
    });
    await refreshUsers();
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-light italic text-[#31332f]"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            Team
          </h1>
          <p
            className="text-sm text-[#5e605b] mt-0.5"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {users.length} member{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowInvite(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>person_add</span>
          Invite Member
        </Button>
      </div>

      {/* Users table */}
      <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f5f4ef]">
              {["Member", "Role", "Joined", "Integrations", "Actions"].map((h) => (
                <th
                  key={h}
                  className="text-left px-5 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-5 py-4">
                    <div className="h-4 bg-[#f5f4ef] rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <p className="text-sm text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                    No team members yet.
                  </p>
                </td>
              </tr>
            ) : (
              users.map((user, i) => (
                <tr
                  key={user.id}
                  className={`${i % 2 === 0 ? "" : "bg-[#fbf9f5]"} hover:bg-[#f5f4ef] transition-colors`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full bg-[#366769] flex items-center justify-center text-[#e3feff] text-sm font-semibold shrink-0"
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#31332f]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{user.name}</p>
                        <p className="text-xs text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge color={user.role === "admin" ? "primary" : "secondary"}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      {user.discordWebhookUrl && (
                        <span title="Discord webhook configured" className="w-5 h-5 flex items-center justify-center">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#5865F2]">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.057a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                          </svg>
                        </span>
                      )}
                      {!user.discordWebhookUrl && (
                        <span className="text-xs text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditUser(user)}
                        className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#f5f4ef] hover:text-[#31332f] transition-colors"
                        title="Edit"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span>
                      </button>
                      <button
                        onClick={() => handleDeactivate(user)}
                        className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#fff7f6] hover:text-[#a73b21] transition-colors"
                        title="Deactivate"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>person_off</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite Team Member">
        <InviteForm onSave={handleInvite} onCancel={() => setShowInvite(false)} />
      </Modal>

      {/* Edit user modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Member" size="md">
        {editUser && (
          <EditUserForm user={editUser} onSave={handleEdit} onCancel={() => setEditUser(null)} />
        )}
      </Modal>
    </div>
  );
}
