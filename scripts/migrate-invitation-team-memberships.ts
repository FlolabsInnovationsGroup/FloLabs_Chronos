import { readFileSync } from "fs";
import { resolve } from "path";

try {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
} catch {}

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL ?? process.env.FL_CHRONOS_DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS invitation_team_memberships (
      invitation_id UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (invitation_id, team_id)
    )
  `;

  await sql`
    INSERT INTO invitation_team_memberships (invitation_id, team_id)
    SELECT id, team_id
    FROM invitations
    WHERE team_id IS NOT NULL
    ON CONFLICT (invitation_id, team_id) DO NOTHING
  `;

  console.log("Migration complete: invitation_team_memberships created and backfilled.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
