"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { TeamMemberNotionPicker } from "@/components/team/TeamMemberNotionPicker";
import type { Invitation, Role, Team } from "@/types";

interface TeamInvitation extends Invitation {
  inviteUrl: string;
}

const INVITE_ROLES = [
  { value: "member", label: "Member" },
  { value: "team_lead", label: "Team Lead" },
];

function formatRole(role: Role) {
  return role === "team_lead" ? "Team Lead" : role === "admin" ? "Admin" : role === "hr" ? "Human Resources" : "Member";
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
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      /* non-JSON body */
    }
  }
  if (!res.ok) {
    const errObj = data && typeof data === "object" && data !== null ? (data as { error?: unknown }) : {};
    const msg = typeof errObj.error === "string" && errObj.error.trim() ? errObj.error : null;
    throw new Error(msg ?? `Request failed (${res.status}${res.statusText ? ` ${res.statusText}` : ""}).`);
  }
  return data;
}

interface TeamInvitationsSectionProps {
  teams: Team[];
  activeTeamOptions: { id: string; name: string }[];
  onError?: (message: string) => void;
  /** Bump when parent SSE/poll refreshes so invites reload too. */
  refreshToken?: number;
}

export function TeamInvitationsSection({
  teams,
  activeTeamOptions,
  onError,
  refreshToken = 0,
}: TeamInvitationsSectionProps) {
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [copiedInviteUrl, setCopiedInviteUrl] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [editingInvite, setEditingInvite] = useState<TeamInvitation | null>(null);
  const [confirmDisableInvite, setConfirmDisableInvite] = useState<TeamInvitation | null>(null);
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState<TeamInvitation | null>(null);
  const [inviteTeamMemberNotion, setInviteTeamMemberNotion] = useState<{ id: string; title: string } | null>(null);
  const [inviteCreateNewNotion, setInviteCreateNewNotion] = useState(false);
  const [inviteNewMemberName, setInviteNewMemberName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "team_lead">("member");
  const [inviteTeamIds, setInviteTeamIds] = useState<string[]>([]);
  const [inviteExpiresAt, setInviteExpiresAt] = useState(defaultInviteExpiry());
  const [editInviteExpiresAt, setEditInviteExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const inviteSubmitLock = useRef(false);

  const loadInvitations = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const payload = (await readJson(await fetch("/api/invitations", { cache: "no-store" }))) as {
        invitations?: TeamInvitation[];
      };
      setInvitations(payload.invitations ?? []);
    } catch (err) {
      console.warn("[TeamInvitationsSection] invitations refresh failed", err);
      setInvitations([]);
      onError?.(err instanceof Error ? err.message : "Invitations service unavailable");
    } finally {
      setLoadingInvites(false);
    }
  }, [onError]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations, refreshToken]);

  useEffect(() => {
    if (inviteTeamIds.length === 0 && teams[0]?.id) {
      setInviteTeamIds([teams[0].id]);
    }
  }, [inviteTeamIds.length, teams]);

  useEffect(() => {
    if (!showInvite) return;
    setInviteTeamMemberNotion(null);
    setInviteCreateNewNotion(false);
    setInviteNewMemberName("");
  }, [showInvite]);

  useEffect(() => {
    if (!editingInvite) return;
    setEditInviteExpiresAt(toDatetimeLocal(editingInvite.expiresAt));
  }, [editingInvite]);

  const openInvitations = useMemo(
    () => invitations.filter((invite) => !invite.acceptedAt && new Date(invite.expiresAt).getTime() > Date.now()),
    [invitations],
  );

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const nameForInvite = inviteCreateNewNotion
      ? inviteNewMemberName.trim()
      : (inviteTeamMemberNotion?.title.trim() ?? "");
    if (!nameForInvite) {
      onError?.(
        inviteCreateNewNotion ? "Enter a name for the new Team Member page." : "Select a Team Member page in Notion.",
      );
      return;
    }
    if (!inviteCreateNewNotion && !inviteTeamMemberNotion) {
      onError?.("Select a Team Member page in Notion, or create a new one.");
      return;
    }
    const expiresMs = new Date(inviteExpiresAt).getTime();
    if (!inviteExpiresAt.trim() || Number.isNaN(expiresMs)) {
      onError?.("Choose a valid expiration date and time.");
      return;
    }
    if (inviteSubmitLock.current) return;
    inviteSubmitLock.current = true;

    setSaving(true);

    try {
      const useNotionMemberSource = !inviteCreateNewNotion && Boolean(inviteTeamMemberNotion);
      const data = (await readJson(
        await fetch("/api/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nameForInvite,
            ...(useNotionMemberSource ? {} : { email: inviteEmail, teamIds: inviteTeamIds }),
            role: inviteRole,
            expiresAt: new Date(inviteExpiresAt).toISOString(),
            ...(inviteCreateNewNotion
              ? { createNewNotionTeamMember: true }
              : { notionTeamMemberPageId: inviteTeamMemberNotion!.id }),
          }),
        }),
      )) as { inviteUrl?: string };
      setCopiedInviteUrl(data.inviteUrl ?? "");
      setInviteTeamMemberNotion(null);
      setInviteCreateNewNotion(false);
      setInviteNewMemberName("");
      setInviteEmail("");
      setInviteRole("member");
      setInviteTeamIds([]);
      setInviteExpiresAt(defaultInviteExpiry());
      setShowInvite(false);
      await loadInvitations();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to create invitation.");
    } finally {
      setSaving(false);
      inviteSubmitLock.current = false;
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
        }),
      );
      setEditingInvite(null);
      await loadInvitations();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to update invitation expiration.");
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
        }),
      );
      setConfirmDisableInvite(null);
      await loadInvitations();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to disable invitation.");
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
      await loadInvitations();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to delete invitation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyInvite(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteUrl(url);
    } catch {
      onError?.("Could not copy the invite link.");
    }
  }

  const compactHeadCellClass =
    "px-3 sm:px-4 lg:px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant";
  const compactBodyCellClass = "px-3 sm:px-4 lg:px-5 py-4 align-top";
  const compactEmptyCellClass = "px-3 sm:px-4 lg:px-5 py-10 text-center text-sm text-outline-variant";
  const tableActionsHeadClass =
    "sticky right-0 z-[2] w-[1%] border-l border-outline-variant/30 bg-surface-container-low whitespace-nowrap text-right align-top !px-2 sm:!px-2.5 lg:!px-3 py-3 [box-shadow:var(--c-sticky-column-shadow)]";
  const tableActionsCellClass = (stripedRow: boolean) =>
    `sticky right-0 z-[1] w-[1%] border-l border-outline-variant/30 whitespace-nowrap text-right align-top !px-2 sm:!px-2.5 lg:!px-3 py-4 [box-shadow:var(--c-sticky-column-shadow)] ${stripedRow ? "bg-background" : "bg-surface-container-lowest"}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="text-lg font-light italic text-on-background"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          Pending invitations
        </h2>
        <Button variant="primary" onClick={() => setShowInvite(true)}>
          Invite Member
        </Button>
      </div>

      {copiedInviteUrl && (
        <div className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p
            className="text-sm text-on-background break-all"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            {copiedInviteUrl}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void handleCopyInvite(copiedInviteUrl)}>
            Copy Link
          </Button>
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-x-auto overflow-y-visible">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 lg:min-w-[760px]">
          <thead>
            <tr className="bg-surface-container-low">
              {["Invitee", "Role", "Teams", "Expires", "Actions"].map((heading) => (
                <th
                  key={heading}
                  className={`${compactHeadCellClass} ${heading === "Actions" ? tableActionsHeadClass : ""}`}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  <span>{heading}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingInvites ? (
              <tr>
                <td colSpan={5} className={compactEmptyCellClass}>
                  Loading invitations…
                </td>
              </tr>
            ) : openInvitations.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className={compactEmptyCellClass}
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  No pending invitations.
                </td>
              </tr>
            ) : (
              openInvitations.map((invite, index) => (
                <tr key={invite.id} className={index % 2 === 0 ? "" : "bg-background"}>
                  <td className={compactBodyCellClass}>
                    <p
                      className="text-sm font-medium text-on-background"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {invite.name}
                    </p>
                    <p
                      className="text-xs text-outline-variant"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {invite.email}
                    </p>
                  </td>
                  <td className={`${compactBodyCellClass} whitespace-nowrap`}>
                    <Badge color={invite.role === "team_lead" ? "secondary" : "tertiary"}>
                      <span className="whitespace-nowrap">{formatRole(invite.role)}</span>
                    </Badge>
                  </td>
                  <td className={compactBodyCellClass}>
                    <span
                      className="text-sm text-on-surface-variant"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {(invite.teams ?? []).map((team) => team.name).join(", ") || "Unknown"}
                    </span>
                  </td>
                  <td className={compactBodyCellClass}>
                    <span
                      className="text-sm text-on-surface-variant"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {new Date(invite.expiresAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </td>
                  <td className={`${compactBodyCellClass} ${tableActionsCellClass(index % 2 !== 0)}`}>
                    <div className="flex w-fit max-w-full flex-wrap gap-2 md:ml-auto md:flex-nowrap md:justify-end">
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

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite Member">
        <form onSubmit={handleInvite} className="flex flex-col gap-4">
          <TeamMemberNotionPicker
            variant="invite"
            value={inviteTeamMemberNotion}
            onChange={(next) => {
              setInviteTeamMemberNotion(next);
              setInviteCreateNewNotion(false);
              if (next?.title) setInviteNewMemberName(next.title);
              if (next) {
                setInviteEmail("");
                setInviteTeamIds([]);
              }
            }}
            createNewActive={inviteCreateNewNotion}
            onBeginCreateNew={() => {
              setInviteCreateNewNotion(true);
              setInviteTeamMemberNotion(null);
            }}
            onCancelCreateNew={() => setInviteCreateNewNotion(false)}
          />
          {inviteCreateNewNotion && (
            <Input
              label="Name for new Notion page"
              value={inviteNewMemberName}
              onChange={(e) => setInviteNewMemberName(e.target.value)}
              placeholder="Jane Smith"
              hint="Used as the Team Member title in Notion and as the invite name in Chronos."
            />
          )}
          {inviteTeamMemberNotion && !inviteCreateNewNotion ? (
            <p
              className="text-sm text-on-surface-variant"
              style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
            >
              Email and teams are read from this Team Member row in Notion when you create the invitation.
            </p>
          ) : (
            <>
              <Input
                label="Email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="jane@example.com"
              />
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium text-on-surface-variant uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                >
                  Teams
                </label>
                <MultiSelect
                  options={activeTeamOptions}
                  value={inviteTeamIds}
                  onChange={setInviteTeamIds}
                  placeholder="Choose one or more teams"
                />
              </div>
            </>
          )}
          <Select
            label="Role"
            options={INVITE_ROLES}
            value={inviteRole}
            onChange={(value) => setInviteRole(value as "member" | "team_lead")}
          />
          <Input
            label="Expiration"
            type="datetime-local"
            value={inviteExpiresAt}
            onChange={(e) => setInviteExpiresAt(e.target.value)}
            hint="Default is 7 days from now, but you can change it here."
          />
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

      <Modal
        open={!!editingInvite}
        onClose={() => setEditingInvite(null)}
        title="Edit invitation expiration"
        size="sm"
      >
        <form onSubmit={handleSaveInviteExpiry} className="flex flex-col gap-4">
          <Input
            label="Expiration"
            type="datetime-local"
            value={editInviteExpiresAt}
            onChange={(e) => setEditInviteExpiresAt(e.target.value)}
          />
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

      <Modal
        open={!!confirmDisableInvite}
        onClose={() => setConfirmDisableInvite(null)}
        title="Disable invitation link"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-on-surface-variant"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Disable the invitation link for {confirmDisableInvite?.email}? Existing links will stop working
            immediately.
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
            className="text-sm text-on-surface-variant"
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
    </>
  );
}
