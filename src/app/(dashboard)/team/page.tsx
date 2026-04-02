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
import type { Invitation, Role, Team, User, SSEEvent } from "@/types";
import { useSSE } from "@/hooks/use-sse";

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

function formatRole(role: Role) {
  return role === "team_lead" ? "Team Lead" : role === "admin" ? "Admin" : "Member";
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data;
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

  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<TeamUser | null>(null);
  const [confirmDisableInvite, setConfirmDisableInvite] = useState<TeamInvitation | null>(null);
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState<TeamInvitation | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "team_lead">("member");
  const [inviteTeamIds, setInviteTeamIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [editRole, setEditRole] = useState<Role>("member");
  const [editTeamIds, setEditTeamIds] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editWeeklyTarget, setEditWeeklyTarget] = useState(40);

  type SortKey = "name" | "team" | "weekly" | "joined";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const refresh = useCallback(async () => {
    if (!userId) return;
    setError("");
    setLoading(true);
    try {
      const requests: Promise<Response>[] = [fetch("/api/users", { cache: "no-store" }), fetch("/api/teams", { cache: "no-store" })];
      if (role === "admin") requests.push(fetch("/api/invitations", { cache: "no-store" }));
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

  useSSE(useCallback((event: SSEEvent) => {
    if (event.type === "data:changed" && event.channel === "team") void refresh();
  }, [refresh]));

  useEffect(() => {
    if (inviteTeamIds.length === 0 && teams[0]?.id) setInviteTeamIds([teams[0].id]);
  }, [inviteTeamIds, teams]);

  useEffect(() => {
    if (!editingUser) return;
    setEditRole(editingUser.role);
    setEditTeamIds((editingUser.teams ?? []).map((team) => team.id));
    setEditIsActive(editingUser.isActive);
    setEditWeeklyTarget(editingUser.weeklyTargetHours ?? 40);
  }, [editingUser]);

  const currentUser = useMemo(() => users.find((user) => user.id === userId) ?? null, [userId, users]);
  const openInvitations = useMemo(() => invitations.filter((invite) => !invite.acceptedAt && new Date(invite.expiresAt).getTime() > Date.now()), [invitations]);

  const visibleTeams = useMemo(() => {
    if (teams.length > 0) return teams.map((team) => ({ id: team.id, name: team.name, slug: team.slug, isActive: team.isActive ?? true }));
    if (currentUser?.teams?.length) return currentUser.teams.map((team) => ({ id: team.id, name: team.name, slug: team.slug, isActive: team.isActive ?? true }));
    return currentUser?.team?.id ? [{ id: currentUser.team.id, name: currentUser.team.name, slug: currentUser.team.slug, isActive: true }] : [];
  }, [currentUser?.team, currentUser?.teams, teams]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await readJson(await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: inviteName, email: inviteEmail, role: inviteRole, teamIds: inviteTeamIds }) }));
      setCopiedInviteUrl(data.inviteUrl ?? "");
      setInviteName("");
      setInviteEmail("");
      setInviteRole("member");
      setInviteTeamIds([]);
      setShowInvite(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation.");
    } finally { setSaving(false); }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      await readJson(await fetch(`/api/users/${editingUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(role === "admin" ? { role: editRole, teamIds: editRole === "admin" ? [] : editTeamIds, isActive: editIsActive } : {}), weeklyTargetHours: editWeeklyTarget }) }));
      setEditingUser(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally { setSaving(false); }
  }

  async function handleDeleteUser() { if (!confirmDeleteUser) return; setSaving(true); try { await readJson(await fetch(`/api/users/${confirmDeleteUser.id}`, { method: "DELETE" })); setConfirmDeleteUser(null); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Failed to delete user."); } finally { setSaving(false); } }
  async function handleDisableInvite() { if (!confirmDisableInvite) return; setSaving(true); try { await readJson(await fetch(`/api/invitations/${confirmDisableInvite.id}`, { method: "PATCH" })); setConfirmDisableInvite(null); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Failed to disable invitation."); } finally { setSaving(false); } }
  async function handleDeleteInvite() { if (!confirmDeleteInvite) return; setSaving(true); try { await readJson(await fetch(`/api/invitations/${confirmDeleteInvite.id}`, { method: "DELETE" })); setConfirmDeleteInvite(null); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Failed to delete invitation."); } finally { setSaving(false); } }
  async function handleCopyInvite(url: string) { try { await navigator.clipboard.writeText(url); setCopiedInviteUrl(url); } catch { setError("Could not copy the invite link."); } }

  const sortedUsers = useMemo(() => {
    const sorted = [...users];
    const mult = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name": return mult * a.name.localeCompare(b.name);
        case "team": return mult * (((a.teams ?? []).map((t) => t.name).join(", ") || a.team?.name || "zzz").localeCompare((b.teams ?? []).map((t) => t.name).join(", ") || b.team?.name || "zzz"));
        case "weekly": return mult * ((a.weeklyTargetHours ?? 0) - (b.weeklyTargetHours ?? 0));
        case "joined": return mult * ((a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0));
        default: return 0;
      }
    });
    return sorted;
  }, [users, sortKey, sortDir]);

  const teamCards = visibleTeams.map((team) => ({ ...team, memberCount: users.filter((user) => (user.teams ?? []).some((t) => t.id === team.id) && user.isActive).length, pendingInvites: openInvitations.filter((invite) => (invite.teamIds ?? [invite.teamId]).includes(team.id)).length }));
  const activeTeamOptions = teams.filter((team) => team.isActive ?? true).map((team) => ({ id: team.id, name: team.name }));

  return <div className="flex flex-col gap-8 max-w-6xl mx-auto">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-light italic text-[#31332f]" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>Users</h1><p className="text-sm text-[#5e605b] mt-1" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{role === "admin" ? "Admins manage teams, invitations, and member roles." : role === "team_lead" ? "You can see the members across all teams you belong to." : "You can see all teams you belong to."}</p></div>{role === "admin" && <div className="flex gap-2"><Button variant="primary" onClick={() => setShowInvite(true)}>Invite Member</Button></div>}</div>
    <div className="inline-flex rounded-xl bg-[#f5f4ef] p-1 self-start"><button className={`px-4 py-2 rounded-lg text-sm ${activeTab === "teams" ? "bg-white text-[#31332f] shadow-sm" : "text-[#5e605b]"}`} onClick={() => setActiveTab("teams")}>Teams</button><button className={`px-4 py-2 rounded-lg text-sm ${activeTab === "users" ? "bg-white text-[#31332f] shadow-sm" : "text-[#5e605b]"}`} onClick={() => setActiveTab("users")}>Users</button></div>
    {copiedInviteUrl && <div className="rounded-xl bg-[#f5f4ef] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><p className="text-sm text-[#31332f] break-all" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{copiedInviteUrl}</p><Button variant="ghost" size="sm" onClick={() => void handleCopyInvite(copiedInviteUrl)}>Copy Link</Button></div>}
    {error && <p className="text-sm text-[#a73b21] bg-[#fff7f6] px-4 py-3 rounded-xl" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{error}</p>}
    {activeTab === "teams" && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{loading ? [...Array(3)].map((_, index) => <div key={index} className="h-32 rounded-xl bg-[#f5f4ef] animate-pulse" />) : teamCards.length === 0 ? <div className="md:col-span-3 bg-surface-container-lowest rounded-xl paper-shadow p-6"><p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>No teams are configured yet.</p></div> : teamCards.map((team) => <div key={team.id} className="bg-surface-container-lowest rounded-xl paper-shadow p-5"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wide text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Teams</p><Badge color={team.isActive ? "primary" : "secondary"}>{team.isActive ? "Active" : "Inactive"}</Badge></div><h2 className="text-xl font-light italic text-[#31332f] mt-1" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>{team.name}</h2><p className="text-xs text-[#b2b2ad] mt-1" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{team.slug}</p><div className="grid grid-cols-2 gap-3 mt-4"><div className="rounded-xl bg-[#f5f4ef] p-3"><p className="text-xs uppercase tracking-wide text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Members</p><p className="text-2xl font-light italic text-[#31332f] mt-1" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>{team.memberCount}</p></div><div className="rounded-xl bg-[#f5f4ef] p-3"><p className="text-xs uppercase tracking-wide text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Pending</p><p className="text-2xl font-light italic text-[#31332f] mt-1" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>{team.pendingInvites}</p></div></div></div>)}</div>}
    {activeTab === "users" && (role === "member" ? <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6"><p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{(currentUser?.teams?.length ?? 0) > 0 ? `You currently belong to ${(currentUser?.teams ?? []).map((t) => t.name).join(", ")}.` : "You do not have a team assignment yet."}</p></div> : <><div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden"><table className="w-full"><thead><tr className="bg-[#f5f4ef]">{([{ label: "Member", key: "name" as SortKey },{ label: "Role", key: null },{ label: "Teams", key: "team" as SortKey },{ label: "Weekly", key: "weekly" as SortKey },{ label: "Status", key: null },{ label: "Joined", key: "joined" as SortKey },...((role === "admin" || role === "team_lead") ? [{ label: "Actions", key: null }] : []),] as { label: string; key: SortKey | null }[]).map((col) => <th key={col.label} onClick={col.key ? () => handleSort(col.key as SortKey) : undefined} className={`text-left px-5 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide select-none ${col.key ? "cursor-pointer hover:text-[#31332f]" : ""}`} style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}><span className="inline-flex items-center gap-1">{col.label}{col.key && sortKey === col.key && <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>{sortDir === "asc" ? "arrow_upward" : "arrow_downward"}</span>}</span></th>)}</tr></thead><tbody>{loading ? [...Array(3)].map((_, index) => <tr key={index}><td colSpan={(role === "admin" || role === "team_lead") ? 7 : 6} className="px-5 py-4"><div className="h-4 rounded bg-[#f5f4ef] animate-pulse" /></td></tr>) : users.length === 0 ? <tr><td colSpan={(role === "admin" || role === "team_lead") ? 7 : 6} className="px-5 py-10 text-center text-sm text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>No users in scope.</td></tr> : sortedUsers.map((user, index) => <tr key={user.id} className={index % 2 === 0 ? "" : "bg-[#fbf9f5]"}><td className="px-5 py-4"><div><p className="text-sm font-medium text-[#31332f]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{user.name}</p><p className="text-xs text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{user.email}</p></div></td><td className="px-5 py-4"><Badge color={user.role === "admin" ? "primary" : user.role === "team_lead" ? "secondary" : "tertiary"}>{formatRole(user.role)}</Badge></td><td className="px-5 py-4"><div className="flex flex-wrap gap-1">{(user.teams ?? []).length > 0 ? (user.teams ?? []).map((team) => <Badge key={team.id} color={team.isActive ? "primary" : "secondary"}>{team.name}</Badge>) : <span className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Unassigned</span>}</div></td><td className="px-5 py-4"><span className="text-sm font-medium italic text-[#31332f] tabular-nums" style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}>{user.weeklyTargetHours ?? 40}h</span><span className="text-xs text-[#b2b2ad] ml-1" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>/ week</span></td><td className="px-5 py-4"><Badge color={user.isActive ? "primary" : "secondary"}>{user.isActive ? "active" : "inactive"}</Badge></td><td className="px-5 py-4"><span className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span></td>{(role === "admin" || role === "team_lead") && <td className="px-5 py-4"><div className="flex gap-1"><Tooltip label="Edit member"><button onClick={() => setEditingUser(user)} className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#f5f4ef]"><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span></button></Tooltip>{role === "admin" && user.id !== session?.user.id && <Tooltip label="Delete member"><button onClick={() => setConfirmDeleteUser(user)} className="p-1.5 rounded-lg text-[#5e605b] hover:bg-[#fff7f6] hover:text-[#a73b21]"><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span></button></Tooltip>}</div></td>}</tr>)}</tbody></table></div>{role === "admin" && <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden"><table className="w-full"><thead><tr className="bg-[#f5f4ef]">{["Invitee", "Role", "Teams", "Expires", "Actions"].map((heading) => <th key={heading} className="text-left px-5 py-3 text-xs font-semibold text-[#5e605b] uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{heading}</th>)}</tr></thead><tbody>{openInvitations.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>No invitations yet.</td></tr> : openInvitations.map((invite, index) => <tr key={invite.id} className={index % 2 === 0 ? "" : "bg-[#fbf9f5]"}><td className="px-5 py-4"><p className="text-sm font-medium text-[#31332f]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{invite.name}</p><p className="text-xs text-[#b2b2ad]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{invite.email}</p></td><td className="px-5 py-4"><Badge color={invite.role === "team_lead" ? "secondary" : "tertiary"}>{formatRole(invite.role)}</Badge></td><td className="px-5 py-4"><span className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{(invite.teams ?? []).map((team) => team.name).join(", ") || "Unknown"}</span></td><td className="px-5 py-4"><span className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>{new Date(invite.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></td><td className="px-5 py-4"><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => void handleCopyInvite(invite.inviteUrl)}>Copy Link</Button><Button variant="ghost" size="sm" onClick={() => setConfirmDisableInvite(invite)}>Disable</Button><Button variant="danger" size="sm" onClick={() => setConfirmDeleteInvite(invite)}>Delete</Button></div></td></tr>)}</tbody></table></div>}</>)}
    <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite Member"><form onSubmit={handleInvite} className="flex flex-col gap-4"><Input label="Full Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Smith" /><Input label="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@example.com" /><Select label="Role" options={INVITE_ROLES} value={inviteRole} onChange={(value) => setInviteRole(value as "member" | "team_lead")} /><div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-[#5e605b] uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Teams</label><MultiSelect options={activeTeamOptions} value={inviteTeamIds} onChange={setInviteTeamIds} placeholder="Choose one or more teams" /></div><div className="flex justify-end gap-3"><Button variant="ghost" type="button" onClick={() => setShowInvite(false)}>Cancel</Button><Button variant="primary" type="submit" loading={saving}>Create Invitation</Button></div></form></Modal>
    <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Edit Member"><form onSubmit={handleEditUser} className="flex flex-col gap-4">{role === "admin" && <><Select label="Role" options={EDIT_ROLES} value={editRole} onChange={(value) => setEditRole(value as Role)} /><div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-[#5e605b] uppercase tracking-wide" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Teams</label><MultiSelect options={activeTeamOptions} value={editTeamIds} onChange={setEditTeamIds} placeholder={editRole === "admin" ? "Admins can stay unassigned" : "Choose one or more teams"} disabled={editRole === "admin"} /></div><label className="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} className="w-4 h-4 rounded accent-[#366769]" /><span className="text-sm text-[#31332f]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Active account</span></label></>}<Input label="Weekly Target (hours)" type="number" value={String(editWeeklyTarget)} onChange={(e) => setEditWeeklyTarget(Math.max(0, Math.min(168, Number(e.target.value) || 0)))} hint={`Daily target: ${(editWeeklyTarget / 5).toFixed(1)}h (Mon–Fri)`} /><div className="flex justify-end gap-3"><Button variant="ghost" type="button" onClick={() => setEditingUser(null)}>Cancel</Button><Button variant="primary" type="submit" loading={saving}>Save Changes</Button></div></form></Modal>
    <Modal open={!!confirmDeleteUser} onClose={() => setConfirmDeleteUser(null)} title="Delete member" size="sm"><div className="flex flex-col gap-4"><p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Delete {confirmDeleteUser?.name}? This permanently removes the member account if it has no time entries.</p><div className="flex justify-end gap-3"><Button variant="primary" type="button" onClick={() => setConfirmDeleteUser(null)}>Cancel</Button><Button variant="danger" type="button" onClick={() => void handleDeleteUser()} loading={saving}>Delete member</Button></div></div></Modal>
    <Modal open={!!confirmDisableInvite} onClose={() => setConfirmDisableInvite(null)} title="Disable invitation link" size="sm"><div className="flex flex-col gap-4"><p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Disable the invitation link for {confirmDisableInvite?.email}? Existing links will stop working immediately.</p><div className="flex justify-end gap-3"><Button variant="primary" type="button" onClick={() => setConfirmDisableInvite(null)}>Cancel</Button><Button variant="danger" type="button" onClick={() => void handleDisableInvite()} loading={saving}>Disable link</Button></div></div></Modal>
    <Modal open={!!confirmDeleteInvite} onClose={() => setConfirmDeleteInvite(null)} title="Delete invitation link" size="sm"><div className="flex flex-col gap-4"><p className="text-sm text-[#5e605b]" style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}>Delete the invitation for {confirmDeleteInvite?.email}? This cannot be undone.</p><div className="flex justify-end gap-3"><Button variant="primary" type="button" onClick={() => setConfirmDeleteInvite(null)}>Cancel</Button><Button variant="danger" type="button" onClick={() => void handleDeleteInvite()} loading={saving}>Delete link</Button></div></div></Modal>
  </div>;
}


