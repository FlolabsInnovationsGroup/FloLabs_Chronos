import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { applicants, users } from '@/lib/db/schema';
import { db } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';

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

  return NextResponse.json({ applicant: inserted[0] });
}
