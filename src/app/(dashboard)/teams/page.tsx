"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { cn, formatDurationHuman, getCalendarWeekRangeLocal } from "@/lib/utils";
import type { Team, TimeEntry, User } from "@/types";

function formatRole(role: string) {
  return role === "team_lead" ? "Team Lead" : role === "admin" ? "Admin" : "Member";
}

function formatEntryDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TeamsPage() {
  useSession();

  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [weeklyEntries, setWeeklyEntries] = useState<TimeEntry[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [recentEntries, setRecentEntries] = useState<TimeEntry[]>([]);
  const [memberWeeklyEntries, setMemberWeeklyEntries] = useState<TimeEntry[]>([]);
  const [memberAllTimeEntries, setMemberAllTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberLoading, setMemberLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getCalendarWeekRangeLocal();
      const from = start.toISOString().split("T")[0];
      const to = end.toISOString().split("T")[0];

      const [teamsRes, usersRes, entriesRes] = await Promise.all([
        fetch("/api/teams", { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
        fetch(`/api/entries?from=${from}&to=${to}&limit=1000`, { cache: "no-store" }),
      ]);

      const teamsData = (await teamsRes.json()) as { teams?: Team[] };
      const usersData = (await usersRes.json()) as { users?: User[] };
      const entriesData = (await entriesRes.json()) as { entries?: TimeEntry[] };

      const fetchedTeams = teamsData.teams ?? [];
      setTeams(fetchedTeams);
      setUsers(usersData.users ?? []);
      setWeeklyEntries(entriesData.entries ?? []);

      setSelectedTeamId((prev) => {
        if (prev) return prev;
        return fetchedTeams[0]?.id ?? null;
      });
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedMemberId) {
      setRecentEntries([]);
      setMemberWeeklyEntries([]);
      setMemberAllTimeEntries([]);
      return;
    }

    const { start, end } = getCalendarWeekRangeLocal();
    const from = start.toISOString().split("T")[0];
    const to = end.toISOString().split("T")[0];

    setMemberLoading(true);
    Promise.all([
      fetch(`/api/entries?userId=${selectedMemberId}&limit=3`, { cache: "no-store" }),
      fetch(`/api/entries?userId=${selectedMemberId}&from=${from}&to=${to}&limit=1000`, { cache: "no-store" }),
      fetch(`/api/entries?userId=${selectedMemberId}&limit=10000`, { cache: "no-store" }),
    ])
      .then(async ([recentRes, weeklyRes, allTimeRes]) => {
        const recentData = (await recentRes.json()) as { entries?: TimeEntry[] };
        const weeklyData = (await weeklyRes.json()) as { entries?: TimeEntry[] };
        const allTimeData = (await allTimeRes.json()) as { entries?: TimeEntry[] };
        setRecentEntries(recentData.entries ?? []);
        setMemberWeeklyEntries(weeklyData.entries ?? []);
        setMemberAllTimeEntries(allTimeData.entries ?? []);
      })
      .catch(() => {})
      .finally(() => setMemberLoading(false));
  }, [selectedMemberId]);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );

  const teamMembers = useMemo(() => {
    if (!selectedTeamId) return [];
    return users.filter((u) => (u.teams ?? []).some((t) => t.id === selectedTeamId));
  }, [users, selectedTeamId]);

  const selectedMember = useMemo(
    () => users.find((u) => u.id === selectedMemberId) ?? null,
    [users, selectedMemberId]
  );

  const teamStats = useMemo(() => {
    const activeMembers = teamMembers.filter((u) => u.isActive);
    const liveCount = activeMembers.filter((u) => u.activeTimer?.startedAt).length;
    const teamUserIds = new Set(teamMembers.map((u) => u.id));
    const weeklyMs = weeklyEntries
      .filter((e) => teamUserIds.has(e.userId))
      .reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
    const avgTarget =
      activeMembers.length > 0
        ? activeMembers.reduce((sum, u) => sum + (u.weeklyTargetHours ?? 0), 0) / activeMembers.length
        : 0;
    return {
      activeMembers: activeMembers.length,
      liveCount,
      weeklyHours: weeklyMs / 3_600_000,
      avgTarget,
    };
  }, [teamMembers, weeklyEntries]);

  const memberWeeklyHours = useMemo(
    () => memberWeeklyEntries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / 3_600_000,
    [memberWeeklyEntries]
  );

  const memberAllTimeHours = useMemo(
    () => memberAllTimeEntries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / 3_600_000,
    [memberAllTimeEntries]
  );

  function handleTeamSelect(teamId: string) {
    setSelectedTeamId(teamId);
    setSelectedMemberId(null);
  }

  function handleMemberClick(userId: string) {
    setSelectedMemberId((prev) => (prev === userId ? null : userId));
  }

  return (
    <div className="flex flex-col gap-6 max-w-[90rem] mx-auto">
      <div>
        <h1
          className="text-2xl font-light italic text-on-background"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          Teams
        </h1>
        <p
          className="text-sm text-on-surface-variant mt-1"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          View team performance and member activity.
        </p>
      </div>

      {loading ? (
        <div className="flex gap-6">
          <div className="w-64 shrink-0 space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface-container-low animate-pulse" />
            ))}
          </div>
          <div className="flex-1 h-64 rounded-xl bg-surface-container-low animate-pulse" />
        </div>
      ) : (
        <div className="flex gap-6 items-start">
          {/* Left: Team list */}
          <div className="w-64 shrink-0 flex flex-col gap-1">
            {teams.length === 0 ? (
              <p
                className="text-sm text-outline-variant px-3 py-4"
                style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
              >
                No teams available.
              </p>
            ) : (
              teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => handleTeamSelect(team.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl text-sm transition-colors",
                    selectedTeamId === team.id
                      ? "bg-surface-container-high text-primary"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-background"
                  )}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{team.name}</span>
                    {!team.isActive && (
                      <Badge color="secondary" className="shrink-0 text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Right: Team dashboard or member card */}
          <div className="flex-1 min-w-0">
            {!selectedTeam ? (
              <div className="rounded-xl bg-surface-container-lowest paper-shadow p-8 text-center">
                <p
                  className="text-sm text-outline-variant"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Select a team to see details.
                </p>
              </div>
            ) : selectedMember ? (
              /* Member performance card */
              <div className="rounded-xl bg-surface-container-lowest paper-shadow p-6 flex flex-col gap-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedMemberId(null)}
                      className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary mb-3 transition-colors"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                        arrow_back
                      </span>
                      Back to team
                    </button>
                    <h2
                      className="text-xl font-light italic text-on-background"
                      style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                    >
                      {selectedMember.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge
                        color={
                          selectedMember.role === "admin"
                            ? "primary"
                            : selectedMember.role === "team_lead"
                              ? "secondary"
                              : "tertiary"
                        }
                      >
                        {formatRole(selectedMember.role)}
                      </Badge>
                      <Badge color={selectedMember.isActive ? "primary" : "secondary"}>
                        {selectedMember.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {selectedMember.activeTimer?.startedAt && (
                        <Badge color="custom" className="bg-warm-muted text-error-dim">
                          Live
                        </Badge>
                      )}
                    </div>
                  </div>
                  {selectedMember.weeklyTargetHours != null && (
                    <div className="rounded-xl bg-surface-container-low px-4 py-3 text-right shrink-0">
                      <p
                        className="text-xs uppercase tracking-wide text-on-surface-variant"
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        Weekly Target
                      </p>
                      <p
                        className="text-xl font-light italic text-on-background mt-0.5"
                        style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                      >
                        {selectedMember.weeklyTargetHours}h
                      </p>
                    </div>
                  )}
                </div>

                {memberLoading ? (
                  <div className="h-24 rounded-xl bg-surface-container-low animate-pulse" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl bg-surface-container-low p-4">
                        <p
                          className="text-xs uppercase tracking-wide text-on-surface-variant"
                          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                        >
                          This Week
                        </p>
                        <p
                          className="text-2xl font-light italic text-on-background mt-1"
                          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                        >
                          {memberWeeklyHours.toFixed(1)}h
                        </p>
                      </div>
                      <div className="rounded-xl bg-surface-container-low p-4">
                        <p
                          className="text-xs uppercase tracking-wide text-on-surface-variant"
                          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                        >
                          All Time
                        </p>
                        <p
                          className="text-2xl font-light italic text-on-background mt-1"
                          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                        >
                          {memberAllTimeHours.toFixed(1)}h
                        </p>
                      </div>
                    </div>

                    {recentEntries.length > 0 && (
                      <div>
                        <p
                          className="text-xs uppercase tracking-wide text-on-surface-variant mb-3"
                          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                        >
                          Recent Entries
                        </p>
                        <div className="flex flex-col gap-2">
                          {recentEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-xl bg-surface-container-low px-4 py-3 flex items-start justify-between gap-4"
                            >
                              <div className="min-w-0">
                                {entry.project && (
                                  <p
                                    className="text-xs text-on-surface-variant mb-0.5"
                                    style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                  >
                                    {entry.project.name}
                                  </p>
                                )}
                                <p
                                  className="text-sm text-on-background truncate"
                                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                >
                                  {entry.description || (
                                    <span className="text-outline-variant italic">No description</span>
                                  )}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p
                                  className="text-sm font-medium text-on-background"
                                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                >
                                  {entry.durationMs != null ? formatDurationHuman(entry.durationMs) : "—"}
                                </p>
                                <p
                                  className="text-xs text-outline-variant mt-0.5"
                                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                                >
                                  {formatEntryDate(entry.startedAt)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              /* Team dashboard */
              <div className="flex flex-col gap-6">
                <div className="rounded-xl bg-surface-container-lowest paper-shadow p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <p
                      className="text-xs uppercase tracking-wide text-on-surface-variant"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      Team
                    </p>
                    <Badge color={selectedTeam.isActive ? "primary" : "secondary"}>
                      {selectedTeam.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <h2
                    className="text-xl font-light italic text-on-background"
                    style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                  >
                    {selectedTeam.name}
                  </h2>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                    <div className="rounded-xl bg-surface-container-low p-4">
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
                        {teamStats.activeMembers}
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container-low p-4">
                      <p
                        className="text-xs uppercase tracking-wide text-on-surface-variant"
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        Live Now
                      </p>
                      <p
                        className="text-2xl font-light italic text-on-background mt-1"
                        style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                      >
                        {teamStats.liveCount}
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container-low p-4">
                      <p
                        className="text-xs uppercase tracking-wide text-on-surface-variant"
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        This Week
                      </p>
                      <p
                        className="text-2xl font-light italic text-on-background mt-1"
                        style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                      >
                        {teamStats.weeklyHours.toFixed(1)}h
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container-low p-4">
                      <p
                        className="text-xs uppercase tracking-wide text-on-surface-variant"
                        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                      >
                        Avg Target
                      </p>
                      <p
                        className="text-2xl font-light italic text-on-background mt-1"
                        style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
                      >
                        {teamStats.avgTarget.toFixed(0)}h
                      </p>
                    </div>
                  </div>
                </div>

                {/* Member list */}
                <div className="rounded-xl bg-surface-container-lowest paper-shadow overflow-hidden">
                  <div className="px-5 py-4 border-b border-surface-container">
                    <p
                      className="text-xs uppercase tracking-wide text-on-surface-variant font-semibold"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      Members ({teamMembers.length})
                    </p>
                  </div>
                  {teamMembers.length === 0 ? (
                    <p
                      className="px-5 py-8 text-sm text-center text-outline-variant"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      No members in this team.
                    </p>
                  ) : (
                    <div className="divide-y divide-surface-container">
                      {teamMembers.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => handleMemberClick(member.id)}
                          className="w-full text-left px-5 py-4 hover:bg-surface-container-low transition-colors flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <p
                              className="text-sm font-medium text-on-background"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              {member.name}
                            </p>
                            <p
                              className="text-xs text-outline-variant"
                              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                            >
                              {member.email}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                            <Badge
                              color={
                                member.role === "admin"
                                  ? "primary"
                                  : member.role === "team_lead"
                                    ? "secondary"
                                    : "tertiary"
                              }
                            >
                              {formatRole(member.role)}
                            </Badge>
                            <Badge color={member.isActive ? "primary" : "secondary"}>
                              {member.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {member.activeTimer?.startedAt && (
                              <Badge color="custom" className="bg-warm-muted text-error-dim">
                                Live
                              </Badge>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
