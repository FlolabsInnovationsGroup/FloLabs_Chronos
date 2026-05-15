import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teams, timeEntries, users, tags, userEmailAliases } from "@/lib/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
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
  verifyNotionTeamMemberPageRow,
  pushTeamMemberProfileToNotion,
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
  /** Updates `flolabs_users.status` (program pipeline) for this account (admin / HR only). */
  applicantProgramStatus: z.enum(["joined", "graduated", "terminated"]).optional(),
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

  if (parsed.data.applicantProgramStatus !== undefined) {
    updateData.status = parsed.data.applicantProgramStatus;
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
  }

  const notionTeamMemberId = user.notionTeamMemberId?.trim() || null;

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

  // Full mirror push: overwrite the Notion Team Member page with all current Chronos data.
  if (notionTeamMemberId && (userIsAdmin || userIsHr)) {
    try {
      const userTeamRows = await db
        .select({ notionPageId: teams.notionPageId })
        .from(teams)
        .where(inArray(teams.id, finalTeamIds.length > 0 ? finalTeamIds : [""]))
        .then((rows) => (finalTeamIds.length > 0 ? rows : []));
      const notionTeamPageIds = userTeamRows
        .map((row) => row.notionPageId)
        .filter((v): v is string => Boolean(v));
      await pushTeamMemberProfileToNotion({
        notionTeamMemberPageId: notionTeamMemberId,
        name: user.name,
        email: user.email,
        role: user.role as "admin" | "team_lead" | "member" | "hr",
        weeklyTargetHours: user.weeklyTargetHours ?? 40,
        notionTeamPageIds,
      });
    } catch {
      // Non-blocking: DB update succeeds even if Notion mirror fails.
    }
  }
  const userTeams = await getUserTeams(id);
  broadcastDataChange("team");
  return NextResponse.json({
    user: {
      ...user,
      applicantProgramStatus: user.status as "joined" | "graduated" | "terminated" | null,
      teams: userTeams,
      team: userTeams[0] ?? null,
    },
  });
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

  const notionTeamMemberId = existingUser.notionTeamMemberId?.trim() || null;
  if (notionTeamMemberId && !parsedBody.data.notionExitStatus) {
    return NextResponse.json(
      {
        error:
          "This member is linked to a Notion Team Member page. Choose Terminated or Graduated for that row before deleting the account.",
      },
      { status: 400 }
    );
  }

  const [entry] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      or(
        eq(timeEntries.userId, id),
        eq(timeEntries.flolabsId, id),
        eq(timeEntries.applicantId, id)
      )!
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
