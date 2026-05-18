import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { users } from '@/lib/db/schema';
import { db } from '@/lib/db';
import { desc, eq, inArray } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { teamMemberships, teams } from '@/lib/db/schema';
import { ensureTeamMemberPage } from '@/lib/notion';
import { addPrimaryEmailAlias } from '@/lib/user-email-aliases';
import { ensureDiscordResourcesForUser } from '@/lib/discord-provisioning';
import { syncDuplicateReviews } from '@/lib/duplicate-review';
import { resolveNotionTeamMemberLink } from '@/lib/notion-team-member-link';
import { chronosAccessDisabled } from '@/lib/applicant-status';
import {
  resolveApplicantPipelineStage,
  resolveApplicantPipelineStatus,
} from '@/lib/applicant-status-resolution';

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

function toOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function mergePropertyHistory(existingRawData: unknown, incomingRawData: unknown) {
  const existingObject =
    existingRawData && typeof existingRawData === 'object'
      ? (existingRawData as Record<string, unknown>)
      : {};
  const incomingObject =
    incomingRawData && typeof incomingRawData === 'object'
      ? (incomingRawData as Record<string, unknown>)
      : {};
  return { ...existingObject, ...incomingObject };
}

function deriveHubspotPropertyPatch(body: Record<string, unknown>, normalizedEmail: string, name: string) {
  const nowIso = new Date().toISOString();
  const splitName = name.split(/\s+/).filter(Boolean);
  const firstName = toOptionalString(body.firstName) ?? splitName[0] ?? null;
  const lastName =
    toOptionalString(body.lastName) ??
    (splitName.length > 1 ? splitName.slice(1).join(' ') : null);
  const stage = toOptionalString(body.stage);
  const status = toOptionalString(body.status);
  const source = toOptionalString(body.source);
  const roleAppliedFor = toOptionalString(body.roleAppliedFor);

  const statusLike = status?.toLowerCase() ?? '';
  const stageLike = stage?.toLowerCase() ?? '';
  const lifecycleLike =
    stage ??
    (statusLike === 'joined' || statusLike === 'signed'
      ? 'Signed Paid'
      : statusLike === 'rejected'
        ? 'Rejected by us'
        : null);

  return {
    'Record ID': toOptionalString(body.hubspotRecordId) ?? toOptionalString(body.externalApplicantId),
    Email: normalizedEmail,
    'First Name': firstName,
    'Last Name': lastName,
    'First and Last Name': name,
    'Phone Number': toOptionalString(body.phone),
    'Mobile Phone Number': toOptionalString(body.phone),
    'WhatsApp Phone Number': toOptionalString(body.phone),
    'Country/Region': toOptionalString(body.country),
    'State/Region': toOptionalString(body.stateRegion),
    City: toOptionalString(body.city),
    'Date of birth': toOptionalString(body.dateOfBirth),
    Gender: toOptionalString(body.gender),
    'LinkedIn URL': toOptionalString(body.linkedinUrl),
    Education: toOptionalString(body.education),
    'Field of study': toOptionalString(body.fieldOfStudy),
    'Current role': toOptionalString(body.currentJobTitle) ?? toOptionalString(body.currentRole),
    'Company Name': toOptionalString(body.companyName),
    'Job Title': roleAppliedFor,
    Source: source,
    'Record source': source,
    'Lifecycle Stage': lifecycleLike,
    'Lead Status': toOptionalString(body.hubspotLeadStatus) ?? lifecycleLike,
    'Status Flomad': toOptionalString(body.hubspotStatus) ?? status,
    'Last Activity Date': toOptionalString(body.lastWebsiteVisit) ?? nowIso,
    'Last Modified Date': toOptionalString(body.hubspotLastModifiedAt) ?? nowIso,
    'Date of application': toOptionalString(body.joinedAt),
    'Create Date': toOptionalString(body.joinedAt),
    'Contact owner': toOptionalString(body.hubspotOwner),
    'Additional email addresses': Array.isArray((body.hubspotRawData as { emails?: unknown } | null)?.emails)
      ? ((body.hubspotRawData as { emails?: unknown[] }).emails ?? [])
          .map((entry) => String(entry ?? '').trim().toLowerCase())
          .filter(Boolean)
          .join(', ')
      : null,
    'HubSpot last sync (Chronos)': nowIso,
    'HubSpot stage key (Chronos)': stageLike || null,
  } as Record<string, unknown>;
}

function normalizeApplicantStage(
  input: unknown,
  notion: { notionTeamMemberId?: string | null; notionTeamMemberPageUrl?: string | null },
  status: string,
) {
  return resolveApplicantPipelineStage({
    stage: input,
    status,
  });
}

function normalizeApplicantStatus(notion: {
  notionTeamMemberId?: string | null;
  notionTeamMemberPageUrl?: string | null;
  status?: unknown;
}) {
  return resolveApplicantPipelineStatus(notion);
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
      id: users.id,
      externalApplicantId: users.externalApplicantId,
      email: users.email,
      name: users.name,
      phone: users.phoneNumber,
      country: users.country,
      stateRegion: users.stateRegion,
      city: users.city,
      dateOfBirth: users.dateOfBirth,
      gender: users.gender,
      linkedinUrl: users.linkedinUrl,
      education: users.education,
      fieldOfStudy: users.fieldOfStudy,
      currentJobTitle: users.currentJobTitle,
      companyName: users.companyName,
      roleAppliedFor: users.roleAppliedFor,
      stage: users.stage,
      status: users.status,
      joinedAt: users.joinedAt,
      lastWebsiteVisit: users.lastWebsiteVisit,
      source: users.source,
      hubspotRecordId: users.hubspotRecordId,
      hubspotStatus: users.hubspotStatus,
      hubspotOwner: users.hubspotOwner,
      hubspotLifecycleStage: users.hubspotLifecycleStage,
      hubspotLeadStatus: users.hubspotLeadStatus,
      hubspotLastModifiedAt: users.hubspotLastModifiedAt,
      hubspotRawData: users.hubspotRawData,
      syncedToTeamMembers: users.syncedToTeamMembers,
      chronosUserId: users.id,
      chronosUserName: users.name,
    })
    .from(users)
    .orderBy(desc(users.joinedAt));

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
      roleAppliedFor: users.roleAppliedFor,
      hubspotRawData: users.hubspotRawData,
      notionTeamMemberId: users.notionTeamMemberId,
      notionTeamMemberPageUrl: users.notionTeamMemberPageUrl,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  const notionPatch: Partial<{
    notionTeamMemberId: string | null;
    notionTeamMemberPageUrl: string | null;
  }> = (() => {
      const hasNotionKeys = 'notionTeamMemberId' in body || 'notionTeamMemberPageUrl' in body;
      if (!hasNotionKeys) return {};

      const resolved = resolveNotionTeamMemberLink({
        notionTeamMemberId:
          'notionTeamMemberId' in body ? (body.notionTeamMemberId as string | null | undefined) : null,
        notionTeamMemberPageUrl:
          'notionTeamMemberPageUrl' in body ? (body.notionTeamMemberPageUrl as string | null | undefined) : null,
      });

      if (resolved.id || resolved.pageUrl) {
        return {
          notionTeamMemberId: resolved.id,
          notionTeamMemberPageUrl: resolved.pageUrl,
        };
      }
      if (body.clearNotionTeamMemberLink === true) {
        return { notionTeamMemberId: null, notionTeamMemberPageUrl: null };
      }
      return {};
    })();

  const notionForStatus = {
    notionTeamMemberId:
      notionPatch.notionTeamMemberId ?? existingApplicant?.notionTeamMemberId ?? body.notionTeamMemberId ?? null,
    notionTeamMemberPageUrl:
      notionPatch.notionTeamMemberPageUrl ??
      existingApplicant?.notionTeamMemberPageUrl ??
      body.notionTeamMemberPageUrl ??
      null,
    status: body.status,
  };
  const normalizedStatus = normalizeApplicantStatus(notionForStatus);
  const normalizedStage = normalizeApplicantStage(body.stage, notionForStatus, normalizedStatus);
  const chronosActive =
    !chronosAccessDisabled(normalizedStatus) && normalizedStatus === "joined";
  const mergedRoleHistory = mergeRoleHistory({
    incomingRole: String(body.roleAppliedFor ?? ''),
    existingRole: existingApplicant?.roleAppliedFor ?? null,
    existingRawData: existingApplicant?.hubspotRawData ?? null,
    incomingRawData: body.hubspotRawData ?? body.rawData ?? null,
  });
  const mergedRawDataBase = mergePropertyHistory(existingApplicant?.hubspotRawData ?? null, mergedRoleHistory);
  const derivedPatch = deriveHubspotPropertyPatch(body as Record<string, unknown>, normalizedEmail, name);
  const mergedRawData = {
    ...mergedRawDataBase,
    ...derivedPatch,
  };

  const split = name.split(/\s+/).filter(Boolean);
  const firstName = toOptionalString(body.firstName) ?? split[0] ?? name;
  const lastName =
    toOptionalString(body.lastName) ?? ((split.length > 1 ? split.slice(1).join(' ') : '') || firstName);

  const randomPwd = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
  const visit = body.lastWebsiteVisit ? new Date(body.lastWebsiteVisit) : null;

  const inserted = await db
    .insert(users)
    .values({
      externalApplicantId: body.externalApplicantId ?? null,
      email: normalizedEmail,
      name,
      firstName,
      lastName,
      password: randomPwd,
      phoneNumber: body.phone ?? null,
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
      stage: normalizedStage,
      status: normalizedStatus,
      joinedAt: body.joinedAt ? new Date(body.joinedAt) : new Date(),
      lastWebsiteVisit: visit,
      lastVisitedAt: visit ?? undefined,
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
      isActive: body.isActive ?? chronosActive,
      weeklyTargetHours: body.weeklyTargetHours ?? 40,
      profilePictureUrl: body.profilePictureUrl ?? null,
      ...notionPatch,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        externalApplicantId: body.externalApplicantId ?? null,
        name,
        firstName,
        lastName,
        phoneNumber: body.phone ?? null,
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
        stage: normalizedStage,
        status: normalizedStatus,
        joinedAt: body.joinedAt ? new Date(body.joinedAt) : new Date(),
        lastWebsiteVisit: visit,
        lastVisitedAt: visit ?? undefined,
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
        isActive: body.isActive ?? chronosActive,
        weeklyTargetHours: body.weeklyTargetHours ?? 40,
        profilePictureUrl: body.profilePictureUrl ?? null,
        ...notionPatch,
        updatedAt: new Date(),
      },
    })
    .returning();

  const applicant = inserted[0];
  const accessStage = String(normalizedStage || applicant.stage || '').trim().toLowerCase();
  const accessStatus = String(normalizedStatus || applicant.status || '').trim().toLowerCase();
  const shouldProvisionChronosUser = !chronosAccessDisabled(accessStatus);
  const shouldEnableChronosAccess =
    shouldProvisionChronosUser && (accessStage === 'joined' || accessStatus === 'joined');

  if (shouldProvisionChronosUser) {
    try {
      const ensuredUser = applicant;

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

      if (teamMemberPage?.pageId && ensuredUser.notionTeamMemberId !== teamMemberPage.pageId) {
        await db
          .update(users)
          .set({ notionTeamMemberId: teamMemberPage.pageId, updatedAt: new Date() })
          .where(eq(users.id, ensuredUser.id));
      }

      if (teamIds.length > 0) {
        await db.insert(teamMemberships).values(teamIds.map((teamId: string) => ({ userId: ensuredUser.id, teamId }))).onConflictDoNothing();
        await db
          .update(users)
          .set({
            role: body.role ?? ensuredUser.role ?? 'member',
            teamId: teamIds[0],
            isActive: Boolean(body.isActive ?? shouldEnableChronosAccess),
            weeklyTargetHours: body.weeklyTargetHours ?? ensuredUser.weeklyTargetHours ?? 40,
            profilePictureUrl: body.profilePictureUrl ?? ensuredUser.profilePictureUrl ?? null,
            notionTeamMemberId: teamMemberPage?.pageId ?? ensuredUser.notionTeamMemberId ?? null,
            syncedToTeamMembers: Boolean(body.syncedToTeamMembers),
            updatedAt: new Date(),
          })
          .where(eq(users.id, ensuredUser.id));
      } else {
        await db
          .update(users)
          .set({
            role: body.role ?? ensuredUser.role ?? 'member',
            isActive: Boolean(body.isActive ?? shouldEnableChronosAccess),
            weeklyTargetHours: body.weeklyTargetHours ?? ensuredUser.weeklyTargetHours ?? 40,
            profilePictureUrl: body.profilePictureUrl ?? ensuredUser.profilePictureUrl ?? null,
            notionTeamMemberId: teamMemberPage?.pageId ?? ensuredUser.notionTeamMemberId ?? null,
            syncedToTeamMembers: Boolean(body.syncedToTeamMembers),
            updatedAt: new Date(),
          })
          .where(eq(users.id, ensuredUser.id));
      }

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
