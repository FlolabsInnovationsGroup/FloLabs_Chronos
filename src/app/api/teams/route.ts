import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { createTeamSlug } from "@/lib/invitations";
import { canManageTeams, getAccessibleTeams } from "@/lib/permissions";
import { z } from "zod";

const createTeamSchema = z.object({
  name: z.string().min(1),
});

async function createUniqueSlug(name: string) {
  if (!db) {
    return createTeamSlug(name);
  }

  const baseSlug = createTeamSlug(name) || "team";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const [existing] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.slug, slug))
      .limit(1);

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getAccessibleTeams(session.user);
  return NextResponse.json({ teams: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !canManageTeams(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) {
    return NextResponse.json({ error: "DB not available" }, { status: 503 });
  }

  const body = await req.json();
  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const slug = await createUniqueSlug(parsed.data.name);
  const [team] = await db
    .insert(teams)
    .values({
      name: parsed.data.name.trim(),
      slug,
    })
    .returning();

  return NextResponse.json({ team }, { status: 201 });
}
