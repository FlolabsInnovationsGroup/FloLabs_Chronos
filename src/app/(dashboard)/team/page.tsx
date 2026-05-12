"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { DropdownSelect } from "@/components/ui/DropdownSelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { TeamMemberNotionPicker } from "@/components/team/TeamMemberNotionPicker";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSSE } from "@/hooks/use-sse";
import { formatDurationHuman } from "@/lib/utils";
import type { ApplicantProgramStatus, Role, SSEEvent, Team, User } from "@/types";

interface TeamUser extends User {
  discordWebhookUrl?: string | null;
  notifyOnStart?: boolean | null;
  notifyOnStop?: boolean | null;
  dailySummary?: boolean | null;
  requiresNotionProfileLink?: boolean;
}

const EDIT_ROLES = [
  { value: "member", label: "Member" },
  { value: "team_lead", label: "Team Lead" },
  { value: "hr", label: "Human Resources" },
  { value: "admin", label: "Admin" },
];

const TEAM_MEMBER_DELETE_EXIT_OPTIONS = [
  { value: "terminated", label: "Terminated" },
  { value: "graduated", label: "Graduated" },
];

const APPLICANT_PROGRAM_STATUS_OPTIONS: { value: ApplicantProgramStatus; label: string }[] = [
  { value: "joined", label: "Joined (in program)" },
  { value: "graduated", label: "Graduated" },
  { value: "terminated", label: "Terminated" },
];

/** Re-fetch users/teams without blocking the UI — SSE, polling, tab focus. */
const USERS_TEAMS_POLL_MS = 20_000;

type SortKey = "name" | "team" | "weekly" | "live" | "joined";
type SortDir = "asc" | "desc";

function formatRole(role: Role) {
  return role === "team_lead" ? "Team Lead" : role === "admin" ? "Admin" : role === "hr" ? "Human Resources" : "Member";
}

async function readJson(res: Response) {
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      /* non-JSON body (e.g. HTML error page) */
    }
  }
  if (!res.ok) {
    const errObj = data && typeof data === "object" && data !== null ? (data as { error?: unknown }) : {};
    const msg = typeof errObj.error === "string" && errObj.error.trim() ? errObj.error : null;
    throw new Error(msg ?? `Request failed (${res.status}${res.statusText ? ` ${res.statusText}` : ""}).`);
  }
  return data;
}

function getLiveDuration(startedAt?: number | null, now = Date.now()) {
  if (!startedAt) return null;
  return Math.max(0, now - startedAt);
}

export default function TeamPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = session?.user.role;
  const userId = session?.user.id;

  // Members cannot access the Users page — redirect them to the timer
  useEffect(() => {
    if (role === "member") {
      router.replace("/timer");
    }
  }, [role, router]);

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"teams" | "users">("users");
  const [now, setNow] = useState(Date.now());

  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<TeamUser | null>(null);
  const [deleteUserNotionExitStatus, setDeleteUserNotionExitStatus] = useState<"terminated" | "graduated" | "">("");
  const [saving, setSaving] = useState(false);
  const [syncingNotionUserId, setSyncingNotionUserId] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editTeamMemberNotion, setEditTeamMemberNotion] = useState<{ id: string; title: string } | null>(null);
  const [editRole, setEditRole] = useState<Role>("member");
  const [editTeamIds, setEditTeamIds] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editWeeklyTarget, setEditWeeklyTarget] = useState(40);
  const [editApplicantProgramStatus, setEditApplicantProgramStatus] = useState<ApplicantProgramStatus>("joined");
  const [editAlternateEmails, setEditAlternateEmails] = useState("");

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

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) return;
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setError("");
      setLoading(true);
    }

    try {
      const endpointErrors: string[] = [];

      try {
        const usersPayload = (await readJson(await fetch("/api/users", { cache: "no-store" }))) as {
          users?: TeamUser[];
          warning?: string;
        };
        setUsers(usersPayload.users ?? []);
        const warn = usersPayload.warning?.trim();
        if (warn) endpointErrors.push(warn);
      } catch (err) {
        console.warn("[team/page] users refresh failed", err);
        setUsers([]);
        endpointErrors.push("Users service unavailable");
      }

      try {
        const teamsPayload = (await readJson(await fetch("/api/teams", { cache: "no-store" }))) as {
          teams?: Team[];
        };
        setTeams(teamsPayload.teams ?? []);
      } catch (err) {
        console.warn("[team/page] teams refresh failed", err);
        setTeams([]);
        endpointErrors.push("Teams service unavailable");
      }

      if (!silent && endpointErrors.length > 0) {
        setError(endpointErrors.join(" · "));
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load team data.");
      }
    } finally {
      if (!silent) setLoading(false);
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
          void refresh({ silent: true });
        }
      },
      [refresh]
    )
  );

  useEffect(() => {
    if (!userId) return;
    const id = setInterval(() => void refresh({ silent: true }), USERS_TEAMS_POLL_MS);
    return () => clearInterval(id);
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId, refresh]);

  useEffect(() => {
    if (!editingUser) return;
    setEditName(editingUser.name);
    setEditTeamMemberNotion(
      editingUser.notionTeamMemberId
        ? { id: editingUser.notionTeamMemberId, title: editingUser.name }
        : null
    );
    setEditRole(editingUser.role);
    setEditTeamIds((editingUser.teams ?? []).map((team) => team.id));
    setEditIsActive(editingUser.isActive);
    setEditWeeklyTarget(editingUser.weeklyTargetHours ?? 40);
    const ps = editingUser.applicantProgramStatus;
    setEditApplicantProgramStatus(
      ps === "graduated" || ps === "terminated" ? ps : "joined",
    );
    setEditAlternateEmails(
      Array.from(new Set([editingUser.email, ...(editingUser.alternateEmails ?? [])]))
        .filter(Boolean)
        .join(", "),
    );
  }, [editingUser]);

  const currentUser = useMemo(
    () => users.find((user) => user.id === userId) ?? null,
    [userId, users]
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
      })),
    [users, visibleTeams]
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

  const filteredUsers = useMemo(() => {
    let result = sortedUsers;
    if (teamFilter) {
      result = result.filter((u) => (u.teams ?? []).some((t) => t.id === teamFilter));
    }
    if (userSearch.trim()) {
      const q = userSearch.trim().toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.alternateEmails ?? []).some((email) => email.toLowerCase().includes(q))
      );
    }
    return result;
  }, [sortedUsers, teamFilter, userSearch]);

  const usersMissingNotionProfile = useMemo(
    () => filteredUsers.filter((u) => u.requiresNotionProfileLink),
    [filteredUsers],
  );

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
            ...((role === "admin" || role === "hr")
              ? {
                  name: editName,
                  role: editRole,
                  // When promoting to admin, omit teamIds entirely so existing memberships
                  // are preserved on the server and survive a future demotion.
                  ...(editRole !== "admin" ? { teamIds: editTeamIds } : {}),
                  isActive: editIsActive,
                  notionTeamMemberId: editTeamMemberNotion?.id ?? null,
                  applicantProgramStatus: editApplicantProgramStatus,
                  alternateEmails: editAlternateEmails
                    .split(",")
                    .map((value) => value.trim().toLowerCase())
                    .filter(Boolean),
                }
              : {}),
            weeklyTargetHours: editWeeklyTarget,
          }),
        })
      );
      setEditingUser(null);
      await refresh({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncToNotion(userId: string) {
    setSyncingNotionUserId(userId);
    try {
      await readJson(
        await fetch(`/api/users/${userId}/notion-sync`, { method: "POST" })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync to Notion.");
    } finally {
      setSyncingNotionUserId(null);
    }
  }

  async function handleDeleteUser() {
    if (!confirmDeleteUser) return;
    const linkedNotion = Boolean(confirmDeleteUser.notionTeamMemberId?.trim());
    if (linkedNotion && deleteUserNotionExitStatus !== "terminated" && deleteUserNotionExitStatus !== "graduated") {
      setError("Choose whether the Notion Team Member row should be set to Terminated or Graduated.");
      return;
    }
    setSaving(true);
    try {
      await readJson(
        await fetch(`/api/users/${confirmDeleteUser.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            linkedNotion ? { notionExitStatus: deleteUserNotionExitStatus } : {}
          ),
        })
      );
      setConfirmDeleteUser(null);
      setDeleteUserNotionExitStatus("");
      await refresh({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    } finally {
      setSaving(false);
    }
  }

  const userColumns: { label: string; key: SortKey | null }[] = [
    { label: "Member", key: "name" },
    { label: "Role", key: null },
    { label: "Teams", key: "team" },
    { label: "Live", key: "live" },
    { label: "Weekly", key: "weekly" },
    { label: "Joined", key: "joined" },
    ...(role === "admin" || role === "hr" || role === "team_lead" || role === "member" ? [{ label: "Actions", key: null }] : []),
  ];
  const compactHeadCellClass =
    "px-3 sm:px-4 lg:px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant";
  const compactBodyCellClass = "px-3 sm:px-4 lg:px-5 py-4 align-top";
  const compactEmptyCellClass = "px-3 sm:px-4 lg:px-5 py-10 text-center text-sm text-outline-variant";
  /** Narrow column (w-[1%] + nowrap) + sticky right so it stays visible when the table scrolls horizontally. Never add `relative` — it overrides `sticky`. */
  const tableActionsHeadClass =
    "sticky right-0 z-[2] w-[1%] border-l border-outline-variant/30 bg-surface-container-low whitespace-nowrap text-right align-top !px-2 sm:!px-2.5 lg:!px-3 py-3 [box-shadow:var(--c-sticky-column-shadow)]";
  const tableActionsCellClass = (stripedRow: boolean) =>
    `sticky right-0 z-[1] w-[1%] border-l border-outline-variant/30 whitespace-nowrap text-right align-top !px-2 sm:!px-2.5 lg:!px-3 py-4 [box-shadow:var(--c-sticky-column-shadow)] ${stripedRow ? "bg-background" : "bg-surface-container-lowest"}`;

  return (
    <div className="flex flex-col gap-8 max-w-[90rem] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-light italic text-on-background"
            style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
          >
            Users
          </h1>
          <p
            className="text-sm text-on-surface-variant mt-1"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {role === "admin" || role === "hr"
              ? "Admins and Human Resources can manage teams and member roles. The table lists active members on pipeline stage Joined. Members who graduate or terminate are removed from this directory."
              : role === "team_lead"
                ? "You can see every member in the teams you belong to and edit their weekly time commitment."
                : "You see only your account. You can update your weekly time target."}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 md:flex-row md:items-center">
          {(role === "admin" || role === "hr" || role === "team_lead") && (
            <div className="rounded-xl bg-surface-container-low px-3 py-2 text-sm text-on-background">
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
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-surface-container-low p-1 self-start">
        <button
          className={`px-4 py-2 rounded-lg text-sm ${activeTab === "teams" ? "bg-surface-container-lowest text-on-background shadow-sm" : "text-on-surface-variant"}`}
          onClick={() => setActiveTab("teams")}
        >
          Teams
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm ${activeTab === "users" ? "bg-surface-container-lowest text-on-background shadow-sm" : "text-on-surface-variant"}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
      </div>

      {error && (
        <p
          className="text-sm text-error bg-warm-surface px-4 py-3 rounded-xl"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {error}
        </p>
      )}

      {(role === "admin" || role === "hr") && usersMissingNotionProfile.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3 text-amber-900">
          <p className="text-sm">
            {usersMissingNotionProfile.length} joined user(s) have no Team Member Notion page linked.
          </p>
          <button
            type="button"
            className="mt-2 text-sm underline"
            onClick={() => setEditingUser(usersMissingNotionProfile[0] ?? null)}
          >
            Open edit modal to link now
          </button>
        </div>
      )}

      {activeTab === "teams" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading ? (
            [...Array(3)].map((_, index) => (
              <div key={index} className="h-32 rounded-xl bg-surface-container-low animate-pulse" />
            ))
          ) : teamCards.length === 0 ? (
            <div className="md:col-span-3 bg-surface-container-lowest rounded-xl paper-shadow p-6">
              <p
                className="text-sm text-on-surface-variant"
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
                    className="text-xs uppercase tracking-wide text-on-surface-variant"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    Teams
                  </p>
                  <Badge color={team.isActive ? "primary" : "secondary"}>
                    {team.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <h2
                  className="text-xl font-light italic text-on-background mt-1"
                  style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                >
                  {team.name}
                </h2>
                <p
                  className="text-xs text-outline-variant mt-1"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  {team.slug}
                </p>
                <div className="mt-4 rounded-xl bg-surface-container-low p-3">
                  <p
                    className="text-xs uppercase tracking-wide text-on-surface-variant"
                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                  >
                    Members
                  </p>
                  <p
                    className="text-2xl font-light italic text-on-background mt-1"
                    style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                  >
                    {team.memberCount}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "users" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(role === "admin" || role === "hr" || role === "team_lead") && teams.length > 0 && (
                <DropdownSelect
                  options={[
                    { value: "", label: "All teams" },
                    ...teams.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  value={teamFilter}
                  onChange={setTeamFilter}
                  className="w-48"
                  placeholder="All teams"
                />
              )}
              <div className="relative">
                <span
                  className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline-variant pointer-events-none"
                  style={{ fontSize: "15px" }}
                >
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search members…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-sm text-on-background bg-surface-container-low rounded-xl outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-outline-variant w-52"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                />
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-x-auto overflow-y-visible">
              <table className="w-full min-w-0 table-auto border-separate border-spacing-0">
                <thead>
                  <tr className="bg-surface-container-low">
                    {userColumns.map((column) => (
                      <th
                        key={column.label}
                        onClick={column.key ? () => handleSort(column.key as SortKey) : undefined}
                        className={`${compactHeadCellClass} select-none ${column.key ? "cursor-pointer hover:text-on-background" : ""} ${column.label === "Actions" ? tableActionsHeadClass : ""}`}
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
                        <td colSpan={userColumns.length} className="px-3 sm:px-4 lg:px-5 py-4">
                          <div className="h-4 rounded bg-surface-container-low animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={userColumns.length}
                        className={compactEmptyCellClass}
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        {userSearch.trim() ? "No members match your search." : teamFilter ? "No users in this team." : "No users in scope."}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user, index) => {
                      const liveDuration = getLiveDuration(user.activeTimer?.startedAt, now);
                      return (
                        <tr key={user.id} className={index % 2 === 0 ? "" : "bg-background"}>
                          <td className={`${compactBodyCellClass} max-xl:min-w-[12rem]`}>
                            <div>
                              <p
                                className="text-sm font-medium text-on-background"
                                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                              >
                                {user.name}
                              </p>
                              <p
                                className="text-xs text-outline-variant"
                                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                              >
                                {user.email}
                              </p>
                              {(user.alternateEmails ?? []).filter((email) => email !== user.email).length > 0 ? (
                                <p
                                  className="text-[11px] text-outline-variant mt-0.5"
                                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                >
                                  {`Also: ${(user.alternateEmails ?? []).filter((email) => email !== user.email).join(", ")}`}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className={`${compactBodyCellClass} whitespace-nowrap`}>
                            <div className="flex items-center gap-1.5">
                              <Badge color={user.role === "admin" ? "primary" : user.role === "team_lead" ? "secondary" : "tertiary"}>
                                <span className="whitespace-nowrap">{formatRole(user.role)}</span>
                              </Badge>
                              {user.requiresNotionProfileLink ? (
                                <Tooltip label="No Team Member Notion page linked">
                                  <button
                                    type="button"
                                    onClick={() => setEditingUser(user)}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700"
                                  >
                                    !
                                  </button>
                                </Tooltip>
                              ) : null}
                            </div>
                          </td>
                          <td className={`${compactBodyCellClass} max-xl:min-w-[12rem]`}>
                            <div className="flex flex-wrap gap-1">
                              {(user.teams ?? []).length > 0 ? (
                                (user.teams ?? []).map((team) => (
                                  <Badge key={team.id} color={team.isActive ? "primary" : "secondary"}>
                                    {team.name}
                                  </Badge>
                                ))
                              ) : (
                                <span
                                  className="text-sm text-on-surface-variant"
                                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                >
                                  Unassigned
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`${compactBodyCellClass} max-xl:min-w-[14rem]`}>
                            {liveDuration !== null ? (
                              <div className="flex flex-col gap-1">
                                <Badge color="custom" className="bg-warm-muted text-error-dim">Live · {formatDurationHuman(liveDuration)}</Badge>
                                <p
                                  className="text-xs text-on-surface-variant pl-0.5 flex items-start gap-1 min-w-0"
                                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                >
                                  <span className="material-symbols-outlined shrink-0 mt-0.5" style={{ fontSize: "12px" }}>
                                    folder_open
                                  </span>
                                  <span className="min-w-0 break-words">
                                    <span className="text-outline-variant">Project · </span>
                                    {user.activeTimer?.projectName ?? "—"}
                                  </span>
                                </p>
                                {user.activeTimer?.description && (
                                  <p
                                    className="max-w-[16rem] text-xs text-on-surface-variant break-words"
                                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                  >
                                    {user.activeTimer.description}
                                  </p>
                                )}
                                {user.activeTimer?.notionTaskPageId && user.activeTimer?.notionTaskTitle ? (
                                  <a
                                    href={`https://www.notion.so/${user.activeTimer.notionTaskPageId.replace(/-/g, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex max-w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#755a40]/30"
                                  >
                                    <Badge
                                      color="custom"
                                      className="max-w-full min-w-0 bg-[#fed9b8] text-[#755a40] transition-colors hover:bg-[#f4ceb0]"
                                    >
                                      <span className="material-symbols-outlined mr-0.5 shrink-0" style={{ fontSize: "11px" }}>
                                        task
                                      </span>
                                      <span className="truncate" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>
                                        {user.activeTimer.notionTaskTitle}
                                      </span>
                                    </Badge>
                                  </a>
                                ) : null}
                              </div>
                            ) : (
                              <span
                                className="text-sm text-outline-variant"
                                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td className={compactBodyCellClass}>
                            <span
                              className="text-sm font-medium italic text-on-background tabular-nums"
                              style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                            >
                              {user.weeklyTargetHours ?? 40}h
                            </span>
                            <span
                              className="text-xs text-outline-variant ml-1"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              / week
                            </span>
                          </td>
                          <td className={compactBodyCellClass}>
                            <span
                              className="text-sm text-on-surface-variant"
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
                          {(role === "admin" || role === "hr" || role === "team_lead" || role === "member") && (
                            <td
                              className={`${compactBodyCellClass} ${tableActionsCellClass(index % 2 !== 0)}`}
                            >
                              <div className="flex w-fit max-w-full gap-0.5 sm:gap-1 md:ml-auto md:flex-nowrap md:justify-end">
                                {(role === "admin" || role === "hr" || role === "team_lead") && (
                                  <>
                                    <Tooltip label="Edit member">
                                      <button
                                        type="button"
                                        onClick={() => setEditingUser(user)}
                                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low"
                                      >
                                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                          edit
                                        </span>
                                      </button>
                                    </Tooltip>
                                    {(role === "admin" || role === "hr") && user.notionTeamMemberId && (
                                      <Tooltip label="Push to Notion">
                                        <button
                                          type="button"
                                          onClick={() => void handleSyncToNotion(user.id)}
                                          disabled={syncingNotionUserId === user.id}
                                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
                                        >
                                          <span
                                            className={`material-symbols-outlined ${syncingNotionUserId === user.id ? "animate-spin" : ""}`}
                                            style={{ fontSize: "16px" }}
                                          >
                                            {syncingNotionUserId === user.id ? "progress_activity" : "cloud_sync"}
                                          </span>
                                        </button>
                                      </Tooltip>
                                    )}
                                    {(role === "admin" || role === "hr") && user.id !== session?.user.id && (
                                      <Tooltip label="Delete member">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setConfirmDeleteUser(user);
                                            setDeleteUserNotionExitStatus("");
                                          }}
                                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-warm-surface hover:text-error"
                                        >
                                          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                            delete
                                          </span>
                                        </button>
                                      </Tooltip>
                                    )}
                                  </>
                                )}
                                {role === "member" && user.id === userId && (
                                  <Tooltip label="Edit weekly target">
                                    <button
                                      type="button"
                                      onClick={() => setEditingUser(user)}
                                      className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low"
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                        edit
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
          </>
        )}

      <Modal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={role === "member" ? "Weekly target" : role === "team_lead" ? "Weekly target" : "Edit Member"}
      >
        <form onSubmit={handleEditUser} className="flex flex-col gap-4">
          {(role === "admin" || role === "hr") && (
            <>
              <TeamMemberNotionPicker
                variant="edit"
                label="Notion Team Member"
                value={editTeamMemberNotion}
                onChange={(next) => {
                  setEditTeamMemberNotion(next);
                  if (next?.title) setEditName(next.title);
                }}
              />
              <Select label="Role" options={EDIT_ROLES} value={editRole} onChange={(value) => setEditRole(value as Role)} />
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
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
                  className="w-4 h-4 rounded accent-primary"
                />
                <span
                  className="text-sm text-on-background"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Active account
                </span>
              </label>
              <Select
                label="Applicant program (Joined pipeline)"
                options={APPLICANT_PROGRAM_STATUS_OPTIONS}
                value={editApplicantProgramStatus}
                onChange={(v) => {
                  if (v === "joined" || v === "graduated" || v === "terminated") {
                    setEditApplicantProgramStatus(v);
                  }
                }}
              />
              <p
                className="text-xs text-on-surface-variant -mt-2"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Updates the linked applicant record in Chronos. Terminated or Graduated removes them from this directory.
              </p>
              <Input
                label="Associated emails"
                value={editAlternateEmails}
                onChange={(e) => setEditAlternateEmails(e.target.value)}
                hint="Comma-separated emails. First one becomes the primary Chronos email."
              />
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

      <Modal
        open={!!confirmDeleteUser}
        onClose={() => {
          setConfirmDeleteUser(null);
          setDeleteUserNotionExitStatus("");
        }}
        title="Delete member"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-on-surface-variant"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Delete {confirmDeleteUser?.name}? This permanently removes the Chronos account if they have no time entries.
            Chronos does not delete their Notion time entries or other pages.
          </p>
          {confirmDeleteUser?.notionTeamMemberId?.trim() ? (
            <>
              <p
                className="text-sm text-on-surface-variant"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                Their linked Team Member row in Notion will only be updated: set the status for that row before
                removing the account.
              </p>
              <Select
                label="Team Member status in Notion"
                placeholder="Choose…"
                options={TEAM_MEMBER_DELETE_EXIT_OPTIONS}
                value={deleteUserNotionExitStatus}
                onChange={(v) => {
                  if (v === "terminated" || v === "graduated") setDeleteUserNotionExitStatus(v);
                  else setDeleteUserNotionExitStatus("");
                }}
              />
            </>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button
              variant="primary"
              type="button"
              onClick={() => {
                setConfirmDeleteUser(null);
                setDeleteUserNotionExitStatus("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={() => void handleDeleteUser()}
              loading={saving}
              disabled={
                Boolean(confirmDeleteUser?.notionTeamMemberId?.trim()) &&
                deleteUserNotionExitStatus !== "terminated" &&
                deleteUserNotionExitStatus !== "graduated"
              }
            >
              Delete member
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
