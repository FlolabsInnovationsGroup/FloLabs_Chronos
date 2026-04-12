import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { db } from '@/lib/db';
import { applicants, users } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

async function main() {
  if (!db) throw new Error('Database is not configured');

  const filePath = path.join(process.cwd(), 'scripts', 'hubspot-import-data.jsonl');
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  let count = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as Record<string, any>;
    const email = String(row.email ?? '').trim().toLowerCase();
    const name = String(row.name ?? '').trim();
    if (!email || !name) continue;

    const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    await db
      .insert(applicants)
      .values({
        externalApplicantId: row.externalApplicantId ?? null,
        hubspotRecordId: row.hubspotRecordId ?? null,
        email,
        name,
        phone: row.phone ?? null,
        country: row.country ?? null,
        stateRegion: row.stateRegion ?? null,
        city: row.city ?? null,
        dateOfBirth: row.dateOfBirth ?? null,
        gender: row.gender ?? null,
        linkedinUrl: row.linkedinUrl ?? null,
        education: row.education ?? null,
        fieldOfStudy: row.fieldOfStudy ?? null,
        currentJobTitle: row.currentJobTitle ?? null,
        companyName: row.companyName ?? null,
        roleAppliedFor: row.roleAppliedFor ?? null,
        stage: row.stage ?? 'new',
        status: row.status ?? 'active',
        joinedAt: row.joinedAt ? new Date(row.joinedAt) : new Date(),
        lastWebsiteVisit: row.lastWebsiteVisit ? new Date(row.lastWebsiteVisit) : null,
        source: row.source ?? null,
        hubspotStatus: row.hubspotStatus ?? null,
        hubspotOwner: row.hubspotOwner ?? null,
        hubspotLifecycleStage: row.hubspotLifecycleStage ?? null,
        hubspotLeadStatus: row.hubspotLeadStatus ?? null,
        hubspotLastModifiedAt: row.hubspotLastModifiedAt ? new Date(row.hubspotLastModifiedAt) : null,
        hubspotRawData: row.hubspotRawData ?? null,
        syncedToTeamMembers: Boolean(row.syncedToTeamMembers),
        chronosUserId: existingUser[0]?.id ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: applicants.email,
        set: {
          externalApplicantId: row.externalApplicantId ?? null,
          hubspotRecordId: row.hubspotRecordId ?? null,
          name,
          phone: row.phone ?? null,
          country: row.country ?? null,
          stateRegion: row.stateRegion ?? null,
          city: row.city ?? null,
          dateOfBirth: row.dateOfBirth ?? null,
          gender: row.gender ?? null,
          linkedinUrl: row.linkedinUrl ?? null,
          education: row.education ?? null,
          fieldOfStudy: row.fieldOfStudy ?? null,
          currentJobTitle: row.currentJobTitle ?? null,
          companyName: row.companyName ?? null,
          roleAppliedFor: row.roleAppliedFor ?? null,
          stage: row.stage ?? 'new',
          status: row.status ?? 'active',
          joinedAt: row.joinedAt ? new Date(row.joinedAt) : sql`${applicants.joinedAt}`,
          lastWebsiteVisit: row.lastWebsiteVisit ? new Date(row.lastWebsiteVisit) : null,
          source: row.source ?? null,
          hubspotStatus: row.hubspotStatus ?? null,
          hubspotOwner: row.hubspotOwner ?? null,
          hubspotLifecycleStage: row.hubspotLifecycleStage ?? null,
          hubspotLeadStatus: row.hubspotLeadStatus ?? null,
          hubspotLastModifiedAt: row.hubspotLastModifiedAt ? new Date(row.hubspotLastModifiedAt) : null,
          hubspotRawData: row.hubspotRawData ?? null,
          chronosUserId: existingUser[0]?.id ?? null,
          updatedAt: new Date(),
        },
      });

    count += 1;
    if (count % 500 === 0) {
      console.log(`Imported ${count}`);
    }
  }

  console.log(`Finished importing ${count} HubSpot leads.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
