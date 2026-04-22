import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applicants, teams, timeEntries, users, tags, userEmailAliases } from "@/lib/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  canManageTeams,
  getAccessibleTeamIds,
  getUserTeams,
  isAdmin,
  isMember,
  isTeamLead,
  replaceUserTeamMemberships,
} from "@/lib/permissions";
import { broadcastDataChange } from "@/lib/realtime";
import {
  setTeamMemberExitStatusInNotion,
  updateTeamMemberName,
  updateTeamMemberRoleInNotion,
  updateTeamMemberTimeCommitment,
  verifyNotionTeamMemberPageRow,
  ensureTeamMemberPage,
} from "@/lib/notion";

const deleteUserBodySchema = z.object({
  notionExitStatus: z.enum(["terminated", "graduated"]).optional(),
});

const updateSchema = z.object({
  role: z.enum(["admin", "team_lead", "member", "hr"]).optional(),
  name: z.string().min(1).optional(),
  teamId: z.string().uuid().nullable().optional(),
  teamIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
  weeklyTargetHours: z.number().min(0).max(168).optional(),
  notionTeamMemberId: z.string().min(1).nullable().optional(),
  discordWebhookUrl: z.string().url().nullable().optional(),
  notifyOnStart: z.boolean().optional(),
  notifyOnStop: z.boolean().optional(),
  dailySummary: z.boolean().optional(),
  /** Updates linked `applicants.status` rows for this Chronos user (admin / HR only). */
  applicantProgramStatus: z.enum(["active", "graduated", "terminated"]).optional(),
  alternateEmails: z.array(z.string().email()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIsAdmin = isAdmin(session.user);
  const userIsHr = session.user.role === "hr";
  const userIsTeamLead = isTeamLead(session.user);
  const userIsMember = isMember(session.user);

  if (!userIsAdmin && !userIsTeamLead && !userIsMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const [existingUser] = await db
    .select({
      id: users.id,
      role: users.role,
      teamId: users.teamId,
      name: users.name,
      email: users.email,
      notionTeamMemberId: users.notionTeamMemberId,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existingUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.applicantProgramStatus !== undefined && !userIsAdmin && !userIsHr) {
    return NextResponse.json({ error: "Only admins and HR can update applicant program status." }, { status: 403 });
  }
  if (parsed.data.alternateEmails !== undefined && !userIsAdmin && !userIsHr) {
    return NextResponse.json({ error: "Only admins and HR can update associated emails." }, { status: 403 });
  }

  const sessionChronosId = session.user.chronosUserId ?? null;

  if (userIsMember && !userIsAdmin && !userIsTeamLead) {
    if (!sessionChronosId || id !== sessionChronosId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const allowedKeys = ["weeklyTargetHours"];
    const attemptedKeys = Object.keys(parsed.data).filter(
      (k) => parsed.data[k as keyof typeof parsed.data] !== undefined
    );
    const forbidden = attemptedKeys.filter((k) => !allowedKeys.includes(k));
    if (forbidden.length > 0) {
      return NextResponse.json({ error: "Members can only update their own weekly target hours." }, { status: 403 });
    }
  } else if (userIsTeamLead && !userIsAdmin) {
    const accessibleTeamIds = await getAccessibleTeamIds(session.user);
    const existingTeams = await getUserTeams(existingUser.id);
    const overlap = existingTeams.some((team) => accessibleTeamIds?.includes(team.id));
    if (!sessionChronosId || (!overlap && existingUser.id !== sessionChronosId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const allowedKeys = ["weeklyTargetHours"];
    const attemptedKeys = Object.keys(parsed.data).filter(
      (k) => parsed.data[k as keyof typeof parsed.data] !== undefined
    );
    const forbidden = attemptedKeys.filter((k) => !allowedKeys.includes(k));
    if (forbidden.length > 0) {
      return NextResponse.json({ error: "Team leads can only update weekly target hours." }, { status: 403 });
    }
  }

  const finalRole = parsed.data.role ?? existingUser.role;
  const requestedTeamIds = parsed.data.teamIds ?? (parsed.data.teamId !== undefined ? (parsed.data.teamId ? [parsed.data.teamId] : []) : undefined);
  const existingTeams = await getUserTeams(existingUser.id);
  const finalTeamIds = requestedTeamIds ?? existingTeams.map((team) => team.id);

  const mutatesTeamsOrRole =
    requestedTeamIds !== undefined ||
    parsed.data.teamId !== undefined ||
    (parsed.data.role !== undefined && parsed.data.role !== existingUser.role);

  if (finalRole !== "admin" && finalTeamIds.length === 0 && mutatesTeamsOrRole) {
    return NextResponse.json(
      { error: "Team leads and members must belong to at least one team." },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.alternateEmails !== undefined) {
    const normalized = Array.from(
      new Set(
        parsed.data.alternateEmails
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (normalized.length > 0) {
      updateData.email = normalized[0];
    }
  }
  if (parsed.data.teamId !== undefined) updateData.teamId = parsed.data.teamId;
  if (requestedTeamIds !== undefined) updateData.teamId = requestedTeamIds[0] ?? null;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.discordWebhookUrl !== undefined) updateData.discordWebhookUrl = parsed.data.discordWebhookUrl;
  if (parsed.data.notifyOnStart !== undefined) updateData.notifyOnStart = parsed.data.notifyOnStart;
  if (parsed.data.notifyOnStop !== undefined) updateData.notifyOnStop = parsed.data.notifyOnStop;
  if (parsed.data.dailySummary !== undefined) updateData.dailySummary = parsed.data.dailySummary;
  if (parsed.data.weeklyTargetHours !== undefined) updateData.weeklyTargetHours = parsed.data.weeklyTargetHours;

  if (parsed.data.notionTeamMemberId !== undefined) {
    if (parsed.data.notionTeamMemberId === null) {
      updateData.notionTeamMemberId = null;
    } else {
      try {
        await verifyNotionTeamMemberPageRow(parsed.data.notionTeamMemberId);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid Notion Team Member page." },
          { status: 400 }
        );
      }
      updateData.notionTeamMemberId = parsed.data.notionTeamMemberId;
    }
  }

  const [user] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.alternateEmails !== undefined) {
    const normalized = Array.from(
      new Set(
        parsed.data.alternateEmails
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const allKnownEmails = Array.from(new Set([user.email.toLowerCase(), ...normalized]));
    await db.delete(userEmailAliases).where(eq(userEmailAliases.userId, id));
    if (allKnownEmails.length > 0) {
      await db
        .insert(userEmailAliases)
        .values(
          allKnownEmails.map((email, idx) => ({
            userId: id,
            email,
            isPrimary: idx === 0,
          })),
        )
        .onConflictDoNothing();
    }
    await db
      .update(applicants)
      .set({ email: user.email.toLowerCase(), updatedAt: new Date() })
      .where(eq(applicants.chronosUserId, id));
  }

  if (parsed.data.applicantProgramStatus !== undefined) {
    await db
      .update(applicants)
      .set({ status: parsed.data.applicantProgramStatus, updatedAt: new Date() })
      .where(eq(applicants.chronosUserId, id));
  }

  // Canonical profile mirror: keep applicant profile fields in sync with admin edits.
  await db
    .update(applicants)
    .set({
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.teamId !== undefined
        ? { teamId: parsed.data.teamId }
        : requestedTeamIds !== undefined
          ? { teamId: requestedTeamIds[0] ?? null }
          : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.weeklyTargetHours !== undefined ? { weeklyTargetHours: parsed.data.weeklyTargetHours } : {}),
      ...(parsed.data.notionTeamMemberId !== undefined
        ? { notionTeamMemberId: parsed.data.notionTeamMemberId }
        : {}),
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      updatedAt: new Date(),
    })
    .where(eq(applicants.chronosUserId, id));

  const notionTeamMemberId = user.notionTeamMemberId?.trim() || null;

  if (parsed.data.name !== undefined && parsed.data.name.trim() !== existingUser.name) {
    if (notionTeamMemberId) {
      await updateTeamMemberName(notionTeamMemberId, parsed.data.name.trim()).catch(() => {});
    }
  }

  if (parsed.data.weeklyTargetHours !== undefined && notionTeamMemberId) {
    await updateTeamMemberTimeCommitment(notionTeamMemberId, parsed.data.weeklyTargetHours);
  }

  if (parsed.data.role !== undefined && parsed.data.role !== existingUser.role && notionTeamMemberId) {
    await updateTeamMemberRoleInNotion(notionTeamMemberId, parsed.data.role).catch(() => {});
  }

  // Only replace team memberships when explicitly provided AND the new role is not admin
  // (or when the caller explicitly provides teams for an admin). Sending [] for an admin
  // role change must NOT wipe memberships — preserve them so they survive a demotion back.
  if (requestedTeamIds !== undefined && !(finalRole === "admin" && requestedTeamIds.length === 0 && requestedTeamIds === (parsed.data.teamIds ?? undefined))) {
    // If transitioning TO admin with an empty teamIds list, skip the replacement
    // so existing memberships are preserved for future role reversals.
    const isPromotingToAdmin = finalRole === "admin" && existingUser.role !== "admin";
    const shouldPreserve = isPromotingToAdmin && requestedTeamIds.length === 0;
    if (!shouldPreserve) {
      await replaceUserTeamMemberships(id, requestedTeamIds);
    }
  }

  if (requestedTeamIds !== undefined && notionTeamMemberId) {
    try {
      const notionTeams =
        requestedTeamIds.length > 0
          ? await db
              .select({ notionPageId: teams.notionPageId })
              .from(teams)
              .where(inArray(teams.id, requestedTeamIds))
          : [];
      const notionTeamPageIds = notionTeams
        .map((row) => row.notionPageId)
        .filter((v): v is string => Boolean(v));
      if (notionTeamPageIds.length > 0) {
        await ensureTeamMemberPage({
          email: user.email,
          name: user.name,
          notionTeamMemberPageId: notionTeamMemberId,
          notionTeamPageIds,
        });
      }
    } catch {
      // Non-blocking: user/team update should still succeed if Notion sync fails.
    }
  }
  const userTeams = await getUserTeams(id);
  broadcastDataChange("team");
  return NextResponse.json({ user: { ...user, teams: userTeams, team: userTeams[0] ?? null } });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !canManageTeams(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const { id } = await params;
  if (session.user.chronosUserId && id === session.user.chronosUserId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = deleteUserBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [existingUser] = await db
    .select({ id: users.id, notionTeamMemberId: users.notionTeamMemberId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existingUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [applicantRow] = await db
    .select({ notionTeamMemberId: applicants.notionTeamMemberId })
    .from(applicants)
    .where(eq(applicants.chronosUserId, id))
    .limit(1);

  const notionTeamMemberId =
    applicantRow?.notionTeamMemberId?.trim() || existingUser.notionTeamMemberId?.trim() || null;
  if (notionTeamMemberId && !parsedBody.data.notionExitStatus) {
    return NextResponse.json(
      {
        error:
          "This member is linked to a Notion Team Member page. Choose Terminated or Graduated for that row before deleting the account.",
      },
      { status: 400 }
    );
  }

  const [linkedApplicant] = await db
    .select({ id: applicants.id })
    .from(applicants)
    .where(eq(applicants.chronosUserId, id))
    .limit(1);

  const [entry] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      linkedApplicant
        ? or(
            eq(timeEntries.applicantId, linkedApplicant.id),
            and(isNull(timeEntries.applicantId), eq(timeEntries.userId, id))
          )!
        : eq(timeEntries.userId, id)
    )
    .limit(1);

  if (entry) {
    return NextResponse.json(
      { error: "This member has time entries and cannot be deleted. Deactivate the account instead." },
      { status: 409 }
    );
  }

  if (notionTeamMemberId && parsedBody.data.notionExitStatus) {
    try {
      await setTeamMemberExitStatusInNotion(notionTeamMemberId, parsedBody.data.notionExitStatus);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not update the Team Member status in Notion." },
        { status: 502 }
      );
    }
  }

  await db.delete(tags).where(eq(tags.userId, id));
  await db.delete(users).where(eq(users.id, id));
  broadcastDataChange("team");
  return NextResponse.json({ ok: true });
}
