import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { applicants, users } from '@/lib/db/schema';
import { db } from '@/lib/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { teamMemberships, teams } from '@/lib/db/schema';
import { ensureTeamMemberPage } from '@/lib/notion';
import { addPrimaryEmailAlias } from '@/lib/user-email-aliases';
import { ensureDiscordResourcesForUser } from '@/lib/discord-provisioning';
import { syncDuplicateReviews } from '@/lib/duplicate-review';

function hasServiceAccess(request: Request) {
  const expected = process.env.CHRONOS_SYNC_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${expected}`;
}

function normalizeRole(value: unknown) {
  return String(value ?? '').trim();
}

function mergeRoleHistory(input: {
  incomingRole: string;
  existingRole: string | null;
  existingRawData: unknown;
  incomingRawData: unknown;
}) {
  const roles = new Set<string>();
  const addRole = (value: unknown) => {
    const role = normalizeRole(value);
    if (role) roles.add(role);
  };

  const parseHistory = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return [] as string[];
    const candidate = (raw as { rolesAppliedFor?: unknown }).rolesAppliedFor;
    if (!Array.isArray(candidate)) return [] as string[];
    return candidate.map((item) => String(item ?? '').trim()).filter(Boolean);
  };

  parseHistory(input.existingRawData).forEach(addRole);
  parseHistory(input.incomingRawData).forEach(addRole);
  addRole(input.existingRole);
  addRole(input.incomingRole);

  const existingObject = input.existingRawData && typeof input.existingRawData === 'object'
    ? input.existingRawData as Record<string, unknown>
    : {};
  const incomingObject = input.incomingRawData && typeof input.incomingRawData === 'object'
    ? input.incomingRawData as Record<string, unknown>
    : {};

  return {
    ...existingObject,
    ...incomingObject,
    rolesAppliedFor: Array.from(roles),
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user && !hasServiceAccess(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session?.user && !(session.user.role === 'admin' || session.user.role === 'team_lead')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!db) return NextResponse.json({ applicants: [] });

  const rows = await db
    .select({
      id: applicants.id,
      externalApplicantId: applicants.externalApplicantId,
      email: applicants.email,
      name: applicants.name,
      phone: applicants.phone,
      country: applicants.country,
      stateRegion: applicants.stateRegion,
      city: applicants.city,
      dateOfBirth: applicants.dateOfBirth,
      gender: applicants.gender,
      linkedinUrl: applicants.linkedinUrl,
      education: applicants.education,
      fieldOfStudy: applicants.fieldOfStudy,
      currentJobTitle: applicants.currentJobTitle,
      companyName: applicants.companyName,
      roleAppliedFor: applicants.roleAppliedFor,
      stage: applicants.stage,
      status: applicants.status,
      joinedAt: applicants.joinedAt,
      lastWebsiteVisit: applicants.lastWebsiteVisit,
      source: applicants.source,
      hubspotRecordId: applicants.hubspotRecordId,
      hubspotStatus: applicants.hubspotStatus,
      hubspotOwner: applicants.hubspotOwner,
      hubspotLifecycleStage: applicants.hubspotLifecycleStage,
      hubspotLeadStatus: applicants.hubspotLeadStatus,
      hubspotLastModifiedAt: applicants.hubspotLastModifiedAt,
      hubspotRawData: applicants.hubspotRawData,
      syncedToTeamMembers: applicants.syncedToTeamMembers,
      chronosUserId: applicants.chronosUserId,
      chronosUserName: users.name,
    })
    .from(applicants)
    .leftJoin(users, eq(applicants.chronosUserId, users.id))
    .orderBy(desc(applicants.joinedAt));

  const normalized = rows.map((row) => {
    const raw = row.hubspotRawData;
    const emailsFromRaw =
      raw && typeof raw === "object" && Array.isArray((raw as { emails?: unknown }).emails)
        ? ((raw as { emails?: unknown[] }).emails ?? [])
            .map((value) => String(value).trim().toLowerCase())
            .filter(Boolean)
        : [];
    return {
      ...row,
      emails: Array.from(new Set([row.email.toLowerCase(), ...emailsFromRaw])),
    };
  });

  return NextResponse.json({ applicants: normalized });
}

export async function POST(request: Request) {
  const session = await auth();
  const serviceAccess = hasServiceAccess(request);
  if (!serviceAccess && (!session?.user || session.user.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

  const body = await request.json();
  const normalizedEmail = String(body.email ?? '').toLowerCase();
  const name = String(body.name ?? `${body.firstName ?? ''} ${body.lastName ?? ''}`.trim());
  if (!body.email || !name) {
    return NextResponse.json({ error: 'email and name are required' }, { status: 400 });
  }

  const [existingApplicant] = await db
    .select({
      roleAppliedFor: applicants.roleAppliedFor,
      hubspotRawData: applicants.hubspotRawData,
    })
    .from(applicants)
    .where(eq(applicants.email, normalizedEmail))
    .limit(1);
  const mergedRawData = mergeRoleHistory({
    incomingRole: String(body.roleAppliedFor ?? ''),
    existingRole: existingApplicant?.roleAppliedFor ?? null,
    existingRawData: existingApplicant?.hubspotRawData ?? null,
    incomingRawData: body.hubspotRawData ?? body.rawData ?? null,
  });

  const inserted = await db
    .insert(applicants)
    .values({
      externalApplicantId: body.externalApplicantId ?? null,
      email: normalizedEmail,
      name,
      phone: body.phone ?? null,
      country: body.country ?? null,
      stateRegion: body.stateRegion ?? null,
      city: body.city ?? null,
      dateOfBirth: body.dateOfBirth ?? null,
      gender: body.gender ?? null,
      linkedinUrl: body.linkedinUrl ?? null,
      education: body.education ?? null,
      fieldOfStudy: body.fieldOfStudy ?? null,
      currentJobTitle: body.currentJobTitle ?? body.currentRole ?? null,
      companyName: body.companyName ?? null,
      roleAppliedFor: body.roleAppliedFor ?? null,
      stage: body.stage ?? 'application_submitted',
      status: body.status ?? 'active',
      joinedAt: body.joinedAt ? new Date(body.joinedAt) : new Date(),
      lastWebsiteVisit: body.lastWebsiteVisit ? new Date(body.lastWebsiteVisit) : null,
      source: body.source ?? null,
      hubspotRecordId: body.hubspotRecordId ?? null,
      hubspotStatus: body.hubspotStatus ?? null,
      hubspotOwner: body.hubspotOwner ?? null,
      hubspotLifecycleStage: body.hubspotLifecycleStage ?? null,
      hubspotLeadStatus: body.hubspotLeadStatus ?? null,
      hubspotLastModifiedAt: body.hubspotLastModifiedAt ? new Date(body.hubspotLastModifiedAt) : null,
      hubspotRawData: mergedRawData,
      syncedToTeamMembers: Boolean(body.syncedToTeamMembers),
      role: body.role ?? "member",
      teamId: body.teamId ?? null,
      isActive: body.isActive ?? (body.stage === "joined" || body.stage === "Joined"),
      weeklyTargetHours: body.weeklyTargetHours ?? 40,
      profilePictureUrl: body.profilePictureUrl ?? null,
      notionTeamMemberId: body.notionTeamMemberId ?? null,
      chronosUserId: body.chronosUserId ?? null,
    })
    .onConflictDoUpdate({
      target: applicants.email,
      set: {
        externalApplicantId: body.externalApplicantId ?? null,
        name,
        phone: body.phone ?? null,
        country: body.country ?? null,
        stateRegion: body.stateRegion ?? null,
        city: body.city ?? null,
        dateOfBirth: body.dateOfBirth ?? null,
        gender: body.gender ?? null,
        linkedinUrl: body.linkedinUrl ?? null,
        education: body.education ?? null,
        fieldOfStudy: body.fieldOfStudy ?? null,
        currentJobTitle: body.currentJobTitle ?? body.currentRole ?? null,
        companyName: body.companyName ?? null,
        roleAppliedFor: body.roleAppliedFor ?? null,
        stage: body.stage ?? 'application_submitted',
        status: body.status ?? 'active',
        joinedAt: body.joinedAt ? new Date(body.joinedAt) : new Date(),
        lastWebsiteVisit: body.lastWebsiteVisit ? new Date(body.lastWebsiteVisit) : null,
        source: body.source ?? null,
        hubspotRecordId: body.hubspotRecordId ?? null,
        hubspotStatus: body.hubspotStatus ?? null,
        hubspotOwner: body.hubspotOwner ?? null,
        hubspotLifecycleStage: body.hubspotLifecycleStage ?? null,
        hubspotLeadStatus: body.hubspotLeadStatus ?? null,
        hubspotLastModifiedAt: body.hubspotLastModifiedAt ? new Date(body.hubspotLastModifiedAt) : null,
        hubspotRawData: mergedRawData,
        syncedToTeamMembers: Boolean(body.syncedToTeamMembers),
        role: body.role ?? "member",
        teamId: body.teamId ?? null,
        isActive: body.isActive ?? (body.stage === "joined" || body.stage === "Joined"),
        weeklyTargetHours: body.weeklyTargetHours ?? 40,
        profilePictureUrl: body.profilePictureUrl ?? null,
        notionTeamMemberId: body.notionTeamMemberId ?? null,
        chronosUserId: body.chronosUserId ?? null,
      },
    })
    .returning();

  const applicant = inserted[0];
  const shouldProvisionJoinedProfile = Boolean(body.syncedToTeamMembers) || body.stage === 'joined';

  if (shouldProvisionJoinedProfile) {
    try {
      const [existingUser] = await db.select().from(users).where(eq(users.email, String(body.email).toLowerCase())).limit(1);
      const requestedTeamIds = Array.isArray(body.teamIds)
        ? body.teamIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
        : (typeof body.teamId === 'string' && body.teamId.length > 0 ? [body.teamId] : []);

      const fallbackTeam = requestedTeamIds.length === 0
        ? await db.select({ id: teams.id }).from(teams).where(eq(teams.isActive, true)).orderBy(desc(teams.createdAt)).limit(1)
        : [];
      const teamIds: string[] = requestedTeamIds.length > 0 ? requestedTeamIds : (fallbackTeam[0] ? [fallbackTeam[0].id] : []);

      const teamRows = teamIds.length > 0
        ? await db.select({ id: teams.id, notionPageId: teams.notionPageId }).from(teams).where(inArray(teams.id, teamIds))
        : [];
      const notionTeamPageIds = teamRows.map((row) => row.notionPageId).filter((id): id is string => Boolean(id));

      const teamMemberPage = notionTeamPageIds.length > 0
        ? await ensureTeamMemberPage({
          email: String(body.email).toLowerCase(),
          name,
          notionTeamPageIds,
          forceCreateNew: true,
        })
        : null;

      const ensuredUser = existingUser
        ? existingUser
        : (await db
          .insert(users)
          .values({
            email: String(body.email).toLowerCase(),
            name,
            password: await bcrypt.hash(randomBytes(24).toString('hex'), 12),
            role: body.role ?? 'member',
            teamId: teamIds[0] ?? null,
            isActive: body.isActive ?? true,
            weeklyTargetHours: body.weeklyTargetHours ?? 40,
            profilePictureUrl: body.profilePictureUrl ?? null,
            notionTeamMemberId: teamMemberPage?.pageId ?? null,
          })
          .returning())[0];

      if (teamMemberPage?.pageId && ensuredUser.notionTeamMemberId !== teamMemberPage.pageId) {
        await db
          .update(users)
          .set({ notionTeamMemberId: teamMemberPage.pageId, updatedAt: new Date() })
          .where(eq(users.id, ensuredUser.id));
      }

      if (teamIds.length > 0) {
        await db.insert(teamMemberships).values(teamIds.map((teamId: string) => ({ userId: ensuredUser.id, teamId }))).onConflictDoNothing();
        await db.update(users).set({ teamId: teamIds[0], updatedAt: new Date() }).where(eq(users.id, ensuredUser.id));
      }

      await db
        .update(applicants)
        .set({
          chronosUserId: ensuredUser.id,
          syncedToTeamMembers: true,
          role: (body.role ?? ensuredUser.role ?? "member"),
          teamId: teamIds[0] ?? ensuredUser.teamId ?? null,
          isActive: Boolean(body.isActive ?? ensuredUser.isActive ?? true),
          weeklyTargetHours: body.weeklyTargetHours ?? ensuredUser.weeklyTargetHours ?? 40,
          profilePictureUrl: body.profilePictureUrl ?? ensuredUser.profilePictureUrl ?? null,
          notionTeamMemberId: teamMemberPage?.pageId ?? ensuredUser.notionTeamMemberId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(applicants.id, applicant.id));

      await addPrimaryEmailAlias(ensuredUser.id, ensuredUser.email).catch(() => null);
      await ensureDiscordResourcesForUser({ userId: ensuredUser.id, name: ensuredUser.name }).catch(() => null);

      await syncDuplicateReviews().catch(() => null);
      return NextResponse.json({
        applicant: { ...applicant, chronosUserId: ensuredUser.id, syncedToTeamMembers: true },
        user: {
          id: ensuredUser.id,
          email: ensuredUser.email,
          name: ensuredUser.name,
          notionTeamMemberId: teamMemberPage?.pageId ?? ensuredUser.notionTeamMemberId ?? null,
        },
      });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Joined profile provisioning failed',
        applicant,
      }, { status: 502 });
    }
  }

  await syncDuplicateReviews().catch(() => null);
  return NextResponse.json({ applicant });
}
