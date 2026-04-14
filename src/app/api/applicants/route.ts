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

function hasServiceAccess(request: Request) {
  const expected = process.env.CHRONOS_SYNC_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${expected}`;
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

  return NextResponse.json({ applicants: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  const serviceAccess = hasServiceAccess(request);
  if (!serviceAccess && (!session?.user || session.user.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

  const body = await request.json();
  const name = String(body.name ?? `${body.firstName ?? ''} ${body.lastName ?? ''}`.trim());
  if (!body.email || !name) {
    return NextResponse.json({ error: 'email and name are required' }, { status: 400 });
  }

  const inserted = await db
    .insert(applicants)
    .values({
      externalApplicantId: body.externalApplicantId ?? null,
      email: String(body.email).toLowerCase(),
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
      hubspotRawData: body.hubspotRawData ?? body.rawData ?? null,
      syncedToTeamMembers: Boolean(body.syncedToTeamMembers),
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
        hubspotRawData: body.hubspotRawData ?? body.rawData ?? null,
        syncedToTeamMembers: Boolean(body.syncedToTeamMembers),
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
      const teamIds = requestedTeamIds.length > 0 ? requestedTeamIds : (fallbackTeam[0] ? [fallbackTeam[0].id] : []);

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
            role: 'member',
            teamId: teamIds[0] ?? null,
            isActive: true,
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
        await db.insert(teamMemberships).values(teamIds.map((teamId) => ({ userId: ensuredUser.id, teamId }))).onConflictDoNothing();
        await db.update(users).set({ teamId: teamIds[0], updatedAt: new Date() }).where(eq(users.id, ensuredUser.id));
      }

      await db
        .update(applicants)
        .set({
          chronosUserId: ensuredUser.id,
          syncedToTeamMembers: true,
          updatedAt: new Date(),
        })
        .where(eq(applicants.id, applicant.id));

      await addPrimaryEmailAlias(ensuredUser.id, ensuredUser.email).catch(() => null);
      await ensureDiscordResourcesForUser({ userId: ensuredUser.id, name: ensuredUser.name }).catch(() => null);

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

  return NextResponse.json({ applicant });
}
