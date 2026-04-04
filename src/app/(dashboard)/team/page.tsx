"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSSE } from "@/hooks/use-sse";
import { formatDurationHuman } from "@/lib/utils";
import type { Invitation, Role, SSEEvent, Team, User } from "@/types";

interface TeamUser extends User {
  discordWebhookUrl?: string | null;
  notifyOnStart?: boolean | null;
  notifyOnStop?: boolean | null;
  dailySummary?: boolean | null;
}

interface TeamInvitation extends Invitation {
  inviteUrl: string;
}

const INVITE_ROLES = [
  { value: "member", label: "Member" },
  { value: "team_lead", label: "Team Lead" },
];

const EDIT_ROLES = [
  { value: "member", label: "Member" },
  { value: "team_lead", label: "Team Lead" },
  { value: "admin", label: "Admin" },
];

type SortKey = "name" | "team" | "weekly" | "live" | "joined";
type SortDir = "asc" | "desc";

function formatRole(role: Role) {
  return role === "team_lead" ? "Team Lead" : role === "admin" ? "Admin" : "Member";
}

function toDatetimeLocal(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultInviteExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setSeconds(0, 0);
  return toDatetimeLocal(date);
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

function getLiveDuration(startedAt?: number | null, now = Date.now()) {
  if (!startedAt) return null;
  return Math.max(0, now - startedAt);
}

export default function TeamPage() {
  const { data: session } = useSession();
  const role = session?.user.role;
  const userId = session?.user.id;

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedInviteUrl, setCopiedInviteUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"teams" | "users">("users");
  const [now, setNow] = useState(Date.now());

  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [editingInvite, setEditingInvite] = useState<TeamInvitation | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<TeamUser | null>(null);
  const [confirmDisableInvite, setConfirmDisableInvite] = useState<TeamInvitation | null>(null);
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState<TeamInvitation | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "team_lead">("member");
  const [inviteTeamIds, setInviteTeamIds] = useState<string[]>([]);
  const [inviteExpiresAt, setInviteExpiresAt] = useState(defaultInviteExpiry());
  const [editInviteExpiresAt, setEditInviteExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("member");
  const [editTeamIds, setEditTeamIds] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editWeeklyTarget, setEditWeeklyTarget] = useState(40);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  const refresh = useCallback(async () => {
    if (!userId) return;
    setError("");
    setLoading(true);

    try {
      const requests: Promise<Response>[] = [
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/teams", { cache: "no-store" }),
      ];
      if (role === "admin") {
        requests.push(fetch("/api/invitations", { cache: "no-store" }));
      }

      const payloads = await Promise.all((await Promise.all(requests)).map(readJson));
      setUsers(payloads[0].users ?? []);
      setTeams(payloads[1].teams ?? []);
      setInvitations(role === "admin" ? (payloads[2]?.invitations ?? []) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team data.");
    } finally {
      setLoading(false);
    }
  }, [role, userId]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
  }, [refresh, userId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useSSE(
    useCallback(
      (event: SSEEvent) => {
        if (
          (event.type === "data:changed" && event.channel === "team") ||
          event.type === "timer:start" ||
          event.type === "timer:stop"
        ) {
          void refresh();
        }
      },
      [refresh]
    )
  );

  useEffect(() => {
    if (inviteTeamIds.length === 0 && teams[0]?.id) {
      setInviteTeamIds([teams[0].id]);
    }
  }, [inviteTeamIds.length, teams]);

  useEffect(() => {
    if (!editingUser) return;
    setEditName(editingUser.name);
    setEditRole(editingUser.role);
    setEditTeamIds((editingUser.teams ?? []).map((team) => team.id));
    setEditIsActive(editingUser.isActive);
    setEditWeeklyTarget(editingUser.weeklyTargetHours ?? 40);
  }, [editingUser]);

  useEffect(() => {
    if (!editingInvite) return;
    setEditInviteExpiresAt(toDatetimeLocal(editingInvite.expiresAt));
  }, [editingInvite]);

  const currentUser = useMemo(
    () => users.find((user) => user.id === userId) ?? null,
    [userId, users]
  );

  const openInvitations = useMemo(
    () => invitations.filter((invite) => !invite.acceptedAt && new Date(invite.expiresAt).getTime() > Date.now()),
    [invitations]
  );

  const visibleTeams = useMemo(() => {
    if (teams.length > 0) {
      return teams.map((team) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        isActive: team.isActive ?? true,
      }));
    }
    if (currentUser?.teams?.length) {
      return currentUser.teams.map((team) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        isActive: team.isActive ?? true,
      }));
    }
    return currentUser?.team?.id
      ? [{ id: currentUser.team.id, name: currentUser.team.name, slug: currentUser.team.slug, isActive: true }]
      : [];
  }, [currentUser?.team, currentUser?.teams, teams]);

  const teamCards = useMemo(
    () =>
      visibleTeams.map((team) => ({
        ...team,
        memberCount: users.filter(
          (user) => (user.teams ?? []).some((userTeam) => userTeam.id === team.id) && user.isActive
        ).length,
        pendingInvites: openInvitations.filter((invite) => (invite.teamIds ?? [invite.teamId]).includes(team.id)).length,
      })),
    [openInvitations, users, visibleTeams]
  );

  const activeTeamOptions = useMemo(
    () => teams.filter((team) => team.isActive ?? true).map((team) => ({ id: team.id, name: team.name })),
    [teams]
  );

  const liveUsersCount = useMemo(
    () => users.filter((user) => user.activeTimer?.startedAt).length,
    [users]
  );

  const sortedUsers = useMemo(() => {
    const sorted = [...users];
    const multiplier = sortDir === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return multiplier * a.name.localeCompare(b.name);
        case "team": {
          const aTeams = (a.teams ?? []).map((team) => team.name).join(", ") || a.team?.name || "zzz";
          const bTeams = (b.teams ?? []).map((team) => team.name).join(", ") || b.team?.name || "zzz";
          return multiplier * aTeams.localeCompare(bTeams);
        }
        case "weekly":
          return multiplier * ((a.weeklyTargetHours ?? 0) - (b.weeklyTargetHours ?? 0));
        case "live": {
          const aLive = getLiveDuration(a.activeTimer?.startedAt, now) ?? -1;
          const bLive = getLiveDuration(b.activeTimer?.startedAt, now) ?? -1;
          return multiplier * (aLive - bLive);
        }
        case "joined":
          return (
            multiplier *
            ((a.createdAt ? new Date(a.createdAt).getTime() : 0) -
              (b.createdAt ? new Date(b.createdAt).getTime() : 0))
          );
        default:
          return 0;
      }
    });

    return sorted;
  }, [now, sortDir, sortKey, users]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const data = await readJson(
        await fetch("/api/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: inviteName,
            email: inviteEmail,
            role: inviteRole,
            teamIds: inviteTeamIds,
            expiresAt: new Date(inviteExpiresAt).toISOString(),
          }),
        })
      );
      setCopiedInviteUrl(data.inviteUrl ?? "");
      setInviteName("");
      setInviteEmail("");
      setInviteRole("member");
      setInviteTeamIds([]);
      setInviteExpiresAt(defaultInviteExpiry());
      setShowInvite(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);

    try {
      await readJson(
        await fetch(`/api/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(role === "admin"
              ? {
                  name: editName,
                  role: editRole,
                  teamIds: editRole === "admin" ? [] : editTeamIds,
                  isActive: editIsActive,
                }
              : {}),
            weeklyTargetHours: editWeeklyTarget,
          }),
        })
      );
      setEditingUser(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInviteExpiry(e: React.FormEvent) {
    e.preventDefault();
    if (!editingInvite) return;
    setSaving(true);

    try {
      await readJson(
        await fetch(`/api/invitations/${editingInvite.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresAt: new Date(editInviteExpiresAt).toISOString() }),
        })
      );
      setEditingInvite(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update invitation expiration.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser() {
    if (!confirmDeleteUser) return;
    setSaving(true);
    try {
      await readJson(await fetch(`/api/users/${confirmDeleteUser.id}`, { method: "DELETE" }));
      setConfirmDeleteUser(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisableInvite() {
    if (!confirmDisableInvite) return;
    setSaving(true);
    try {
      await readJson(
        await fetch(`/api/invitations/${confirmDisableInvite.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disableNow: true }),
        })
      );
      setConfirmDisableInvite(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable invitation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteInvite() {
    if (!confirmDeleteInvite) return;
    setSaving(true);
    try {
      await readJson(await fetch(`/api/invitations/${confirmDeleteInvite.id}`, { method: "DELETE" }));
      setConfirmDeleteInvite(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete invitation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyInvite(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteUrl(url);
    } catch {
      setError("Could not copy the invite link.");
    }
  }

  const userColumns: { label: string; key: SortKey | null }[] = [
    { label: "Member", key: "name" },
    { label: "Role", key: null },
    { label: "Teams", key: "team" },
    { label: "Live", key: "live" },
    { label: "Weekly", key: "weekly" },
    { label: "Status", key: null },
    { label: "Joined", key: "joined" },
    ...(role === "admin" || role === "team_lead" ? [{ label: "Actions", key: null }] : []),
  ];

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-light italic text-[#31332f]"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            Users
          </h1>
          <p
            className="text-sm text-[#5e605b] mt-1"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {role === "admin"
              ? "Admins manage teams, invitations, and member roles."
              : role === "team_lead"
                ? "You can see the members across all teams you belong to."
                : "You can see all teams you belong to."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(role === "admin" || role === "team_lead") && (
            <div className="rounded-xl bg-[#f5f4ef] px-3 py-2 text-sm text-[#31332f]">
              <span
                className="font-medium"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                {liveUsersCount}
              </span>{" "}
              <span style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                live now
              </span>
            </div>
          )}
          {role === "admin" && (
            <Button variant="primary" onClick={() => setShowInvite(true)}>
              Invite Member
            </Button>
          )}
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-[#f5f4ef] p-1 self-start">
        <button
          className={`px-4 py-2 rounded-lg text-sm ${activeTab === "teams" ? "bg-white text-[#31332f] shadow-sm" : "text-[#5e605b]"}`}
          onClick={() => setActiveTab("teams")}
        >
          Teams
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm ${activeTab === "users" ? "bg-white text-[#31332f] shadow-sm" : "text-[#5e605b]"}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
      </div>

      {copiedInviteUrl && (
        <div className="rounded-xl bg-[#f5f4ef] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p
            className="text-sm text-[#31332f] break-all"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {copiedInviteUrl}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void handleCopyInvite(copiedInviteUrl)}>
            Copy Link
          </Button>
        </div>
      )}

      {error && (
        <p
          className="text-sm text-[#a73b21] bg-[#fff7f6] px-4 py-3 rounded-xl"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {error}
        </p>
      )}

      {activeTab === "teams" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading ? (
            [...Array(3)].map((_, index) => (
              <div key={index} className="h-32 rounded-xl bg-[#f5f4ef] animate-pulse" />
            ))
          ) : teamCards.length === 0 ? (
            <div className="md:col-span-3 bg-surface-container-lowest rounded-xl paper-shadow p-6">
              <p
                className="text-sm text-[#5e605b]"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                No teams are configured yet.
              </p>
            </div>
          ) : (
            teamCards.map((team) => (
              <div key={team.id} className="bg-surface-container-lowest rounded-xl paper-shadow p-5">
                <div className="flex items-center justify-between">
                  <p
                    className="text-xs uppercase tracking-wide text-[#5e605b]"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    Teams
                  </p>
                  <Badge color={team.isActive ? "primary" : "secondary"}>
                    {team.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <h2
                  className="text-xl font-light italic text-[#31332f] mt-1"
                  style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                >
                  {team.name}
                </h2>
                <p
                  className="text-xs text-[#b2b2ad] mt-1"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {team.slug}
                </p>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="rounded-xl bg-[#f5f4ef] p-3">
                    <p
                      className="text-xs uppercase tracking-wide text-[#5e605b]"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      Members
                    </p>
                    <p
                      className="text-2xl font-light italic text-[#31332f] mt-1"
                      style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                    >
                      {team.memberCount}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#f5f4ef] p-3">
                    <p
                      className="text-xs uppercase tracking-wide text-[#5e605b]"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      Pending
                    </p>
                    <p
                      className="text-2xl font-light italic text-[#31332f] mt-1"
                      style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                    >
                      {team.pendingInvites}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "users" &&
        (role === "member" ? (
          <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6">
            <p
              className="text-sm text-[#5e605b]"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              {(currentUser?.teams?.length ?? 0) > 0
                ? `You currently belong to ${(currentUser?.teams ?? []).map((team) => team.name).join(", ")}.`
                : "You do not have a team assignment yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-x-auto">
              <table className="w-full min-w-[960px]">
                <thead>
                  <tr className="bg-[#f5f4ef]">
                    {userColumns.map((column) => (
                      <th
                        key={column.label}
                        onClick={column.key ? () => handleSort(column.key as SortKey) : undefined}
                        className={`text-left px-5 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide select-none ${column.key ? "cursor-pointer hover:text-[#31332f]" : ""}`}
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        <span className="inline-flex items-center gap-1">
                          {column.label}
                          {column.key && sortKey === column.key && (
                            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                              {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(3)].map((_, index) => (
                      <tr key={index}>
                        <td colSpan={userColumns.length} className="px-5 py-4">
                          <div className="h-4 rounded bg-[#f5f4ef] animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={userColumns.length}
                        className="px-5 py-10 text-center text-sm text-[#b2b2ad]"
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        No users in scope.
                      </td>
                    </tr>
                  ) : (
                    sortedUsers.map((user, index) => {
                      const liveDuration = getLiveDuration(user.activeTimer?.startedAt, now);
                      return (
                        <tr key={user.id} className={index % 2 === 0 ? "" : "bg-[#fbf9f5]"}>
                          <td className="px-5 py-4 align-top">
                            <div>
                              <p
                                className="text-sm font-medium text-[#31332f]"
                                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                              >
                                {user.name}
                              </p>
                              <p
                                className="text-xs text-[#b2b2ad]"
                                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                              >
                                {user.email}
                              </p>
                            </div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap align-top">
                            <Badge color={user.role === "admin" ? "primary" : user.role === "team_lead" ? "secondary" : "tertiary"}>
                              <span className="whitespace-nowrap">{formatRole(user.role)}</span>
                            </Badge>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <div className="flex flex-wrap gap-1">
                              {(user.teams ?? []).length > 0 ? (
                                (user.teams ?? []).map((team) => (
                                  <Badge key={team.id} color={team.isActive ? "primary" : "secondary"}>
                                    {team.name}
                                  </Badge>
                                ))
                              ) : (
                                <span
                                  className="text-sm text-[#5e605b]"
                                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                >
                                  Unassigned
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 align-top">
                            {liveDuration !== null ? (
                              <div className="flex flex-col gap-1">
                                <Badge color="custom" className="bg-[#fde0d9] text-[#791903]">Live · {formatDurationHuman(liveDuration)}</Badge>
                                {user.activeTimer?.description && (
                                  <p
                                    className="max-w-[16rem] text-xs text-[#5e605b] break-words"
                                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                  >
                                    {user.activeTimer.description}
                                  </p>
                                )}
                                {user.activeTimer?.notionTaskTitle && (
                                  <p
                                    className="text-xs text-[#755a40]"
                                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                  >
                                    Task: {user.activeTimer.notionTaskTitle}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span
                                className="text-sm text-[#b2b2ad]"
                                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 align-top">
                            <span
                              className="text-sm font-medium italic text-[#31332f] tabular-nums"
                              style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                            >
                              {user.weeklyTargetHours ?? 40}h
                            </span>
                            <span
                              className="text-xs text-[#b2b2ad] ml-1"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              / week
                            </span>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <Badge color={user.isActive ? "primary" : "secondary"}>
                              {user.isActive ? "active" : "inactive"}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <span
                              className="text-sm text-[#5e605b]"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              {user.createdAt
                                ? new Date(user.createdAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "—"}
                            </span>
                          </td>
                          {(role === "admin" || role === "team_lead") && (
                            <td className="px-5 py-4 align-top">
                              <div className="flex gap-1">
                                <Tooltip label="Edit member">
                                  <button
                                    onClick={() => setEditingUser(user)}
                                    className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#f5f4ef]"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                      edit
                                    </span>
                                  </button>
                                </Tooltip>
                                {role === "admin" && user.id !== session?.user.id && (
                                  <Tooltip label="Delete member">
                                    <button
                                      onClick={() => setConfirmDeleteUser(user)}
                                      className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#fff7f6] hover:text-[#a73b21]"
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                        delete
                                      </span>
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {role === "admin" && (
              <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="bg-[#f5f4ef]">
                      {["Invitee", "Role", "Teams", "Expires", "Actions"].map((heading) => (
                        <th
                          key={heading}
                          className="text-left px-5 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide"
                          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openInvitations.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-10 text-center text-sm text-[#b2b2ad]"
                          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                        >
                          No invitations yet.
                        </td>
                      </tr>
                    ) : (
                      openInvitations.map((invite, index) => (
                        <tr key={invite.id} className={index % 2 === 0 ? "" : "bg-[#fbf9f5]"}>
                          <td className="px-5 py-4">
                            <p
                              className="text-sm font-medium text-[#31332f]"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              {invite.name}
                            </p>
                            <p
                              className="text-xs text-[#b2b2ad]"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              {invite.email}
                            </p>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <Badge color={invite.role === "team_lead" ? "secondary" : "tertiary"}>
                              <span className="whitespace-nowrap">{formatRole(invite.role)}</span>
                            </Badge>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className="text-sm text-[#5e605b]"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              {(invite.teams ?? []).map((team) => team.name).join(", ") || "Unknown"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className="text-sm text-[#5e605b]"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              {new Date(invite.expiresAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex gap-2 flex-wrap">
                              <Button variant="ghost" size="sm" onClick={() => void handleCopyInvite(invite.inviteUrl)}>
                                Copy Link
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingInvite(invite)}>
                                Edit Expiry
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDisableInvite(invite)}>
                                Disable
                              </Button>
                              <Button variant="danger" size="sm" onClick={() => setConfirmDeleteInvite(invite)}>
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ))}

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite Member">
        <form onSubmit={handleInvite} className="flex flex-col gap-4">
          <Input label="Full Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Smith" />
          <Input label="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@example.com" />
          <Select label="Role" options={INVITE_ROLES} value={inviteRole} onChange={(value) => setInviteRole(value as "member" | "team_lead")} />
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Teams
            </label>
            <MultiSelect options={activeTeamOptions} value={inviteTeamIds} onChange={setInviteTeamIds} placeholder="Choose one or more teams" />
          </div>
          <Input label="Expiration" type="datetime-local" value={inviteExpiresAt} onChange={(e) => setInviteExpiresAt(e.target.value)} hint="Default is 7 days from now, but you can change it here." />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Create Invitation
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingInvite} onClose={() => setEditingInvite(null)} title="Edit invitation expiration" size="sm">
        <form onSubmit={handleSaveInviteExpiry} className="flex flex-col gap-4">
          <Input label="Expiration" type="datetime-local" value={editInviteExpiresAt} onChange={(e) => setEditInviteExpiresAt(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setEditingInvite(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Edit Member">
        <form onSubmit={handleEditUser} className="flex flex-col gap-4">
          {role === "admin" && (
            <>
              <Input label="Full Name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Member name" />
              <Select label="Role" options={EDIT_ROLES} value={editRole} onChange={(value) => setEditRole(value as Role)} />
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium text-[#5e605b] uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Teams
                </label>
                <MultiSelect
                  options={activeTeamOptions}
                  value={editTeamIds}
                  onChange={setEditTeamIds}
                  placeholder={editRole === "admin" ? "Admins can stay unassigned" : "Choose one or more teams"}
                  disabled={editRole === "admin"}
                />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#366769]"
                />
                <span
                  className="text-sm text-[#31332f]"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Active account
                </span>
              </label>
            </>
          )}
          <Input
            label="Weekly Target (hours)"
            type="number"
            value={String(editWeeklyTarget)}
            onChange={(e) => setEditWeeklyTarget(Math.max(0, Math.min(168, Number(e.target.value) || 0)))}
            hint={`Daily target: ${(editWeeklyTarget / 5).toFixed(1)}h (Mon–Fri)`}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!confirmDeleteUser} onClose={() => setConfirmDeleteUser(null)} title="Delete member" size="sm">
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Delete {confirmDeleteUser?.name}? This permanently removes the member account if it has no time entries.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="primary" type="button" onClick={() => setConfirmDeleteUser(null)}>
              Cancel
            </Button>
            <Button variant="danger" type="button" onClick={() => void handleDeleteUser()} loading={saving}>
              Delete member
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDisableInvite} onClose={() => setConfirmDisableInvite(null)} title="Disable invitation link" size="sm">
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Disable the invitation link for {confirmDisableInvite?.email}? Existing links will stop working immediately.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="primary" type="button" onClick={() => setConfirmDisableInvite(null)}>
              Cancel
            </Button>
            <Button variant="danger" type="button" onClick={() => void handleDisableInvite()} loading={saving}>
              Disable link
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDeleteInvite} onClose={() => setConfirmDeleteInvite(null)} title="Delete invitation link" size="sm">
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-[#5e605b]"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Delete the invitation for {confirmDeleteInvite?.email}? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="primary" type="button" onClick={() => setConfirmDeleteInvite(null)}>
              Cancel
            </Button>
            <Button variant="danger" type="button" onClick={() => void handleDeleteInvite()} loading={saving}>
              Delete link
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
