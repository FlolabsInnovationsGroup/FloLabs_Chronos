import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  if (!db) throw new Error('Database is not configured');

  const filePath = path.join(process.cwd(), 'scripts', 'hubspot-import-data.jsonl');
  const checkpointPath = path.join(process.cwd(), 'scripts', 'hubspot-import.checkpoint');
  const startAt = fs.existsSync(checkpointPath) ? Number(fs.readFileSync(checkpointPath, 'utf8')) || 0 : 0;
  const limit = Number(process.env.HUBSPOT_IMPORT_LIMIT ?? 2000);
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  const placeholderPwd = await bcrypt.hash(randomBytes(24).toString('hex'), 12);

  let lineNumber = 0;
  let count = 0;
  for await (const line of rl) {
    lineNumber += 1;
    if (lineNumber <= startAt) continue;
    if (!line.trim()) continue;
    const row = JSON.parse(line) as Record<string, any>;
    const email = String(row.email ?? '').trim().toLowerCase();
    const name = String(row.name ?? '').trim();
    if (!email || !name) continue;

    await db
      .insert(users)
      .values({
        externalApplicantId: row.externalApplicantId ?? null,
        hubspotRecordId: row.hubspotRecordId ?? null,
        email,
        name,
        password: placeholderPwd,
        phoneNumber: row.phone ?? null,
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
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          externalApplicantId: row.externalApplicantId ?? null,
          hubspotRecordId: row.hubspotRecordId ?? null,
          name,
          phoneNumber: row.phone ?? null,
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
          joinedAt: row.joinedAt ? new Date(row.joinedAt) : sql`${users.joinedAt}`,
          lastWebsiteVisit: row.lastWebsiteVisit ? new Date(row.lastWebsiteVisit) : null,
          source: row.source ?? null,
          hubspotStatus: row.hubspotStatus ?? null,
          hubspotOwner: row.hubspotOwner ?? null,
          hubspotLifecycleStage: row.hubspotLifecycleStage ?? null,
          hubspotLeadStatus: row.hubspotLeadStatus ?? null,
          hubspotLastModifiedAt: row.hubspotLastModifiedAt ? new Date(row.hubspotLastModifiedAt) : null,
          hubspotRawData: row.hubspotRawData ?? null,
          syncedToTeamMembers: Boolean(row.syncedToTeamMembers),
          updatedAt: new Date(),
        },
      });

    count += 1;
    if (count % 250 === 0) {
      fs.writeFileSync(checkpointPath, String(lineNumber), 'utf8');
      console.log(`Imported ${count} in this run, checkpoint ${lineNumber}`);
    }
    if (count >= limit) {
      fs.writeFileSync(checkpointPath, String(lineNumber), 'utf8');
      console.log(`Paused after ${count} rows in this run at checkpoint ${lineNumber}`);
      return;
    }
  }

  fs.writeFileSync(checkpointPath, String(lineNumber), 'utf8');
  console.log(`Finished importing ${count} HubSpot leads in this run. Final checkpoint ${lineNumber}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
