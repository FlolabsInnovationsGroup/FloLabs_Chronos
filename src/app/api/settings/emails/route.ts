import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userEmailAliases, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ emails: [] });

  const sessionApplicantId = session.user.id;
  const sessionChronosUserId = session.user.chronosUserId ?? null;
  const aliasUserId = sessionChronosUserId ?? sessionApplicantId;

  const [person] = await db
    .select({ email: users.email, hubspotRawData: users.hubspotRawData })
    .from(users)
    .where(eq(users.id, sessionApplicantId))
    .limit(1);
  if (!person) return NextResponse.json({ emails: [] });

  const aliasRows = await db
    .select({ email: userEmailAliases.email })
    .from(userEmailAliases)
    .where(eq(userEmailAliases.userId, aliasUserId));

  let hubspotEmails: string[] = [];
  if (person.hubspotRawData && typeof person.hubspotRawData === "object") {
    const maybeEmails = (person.hubspotRawData as { emails?: unknown }).emails;
    if (Array.isArray(maybeEmails)) {
      hubspotEmails = maybeEmails.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    }
  }

  const emails = Array.from(
    new Set([
      person.email.toLowerCase(),
      ...aliasRows.map((row) => row.email.toLowerCase()),
      ...hubspotEmails,
    ]),
  );
  return NextResponse.json({ emails });
}
