import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applicants, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";

const nameSchema = z.object({
  name: z.string().min(1),
});

const profilePictureSchema = z.object({
  profilePictureUrl: z.string().url().nullable(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB not available" }, { status: 503 });

  const body = await req.json();

  const applicantId = session.user.id;
  const chronosUserId = session.user.chronosUserId ?? null;

  // Name update
  const nameParsed = nameSchema.safeParse(body);
  if (nameParsed.success && !("currentPassword" in body)) {
    const [applicant] = await db
      .update(applicants)
      .set({ name: nameParsed.data.name, updatedAt: new Date() })
      .where(eq(applicants.id, applicantId))
      .returning();

    if (chronosUserId) {
      await db
        .update(users)
        .set({ name: nameParsed.data.name, updatedAt: new Date() })
        .where(eq(users.id, chronosUserId));
    }

    return NextResponse.json({ user: applicant });
  }

  // Profile picture update/remove
  const pictureParsed = profilePictureSchema.safeParse(body);
  if (pictureParsed.success && !("currentPassword" in body) && !("name" in body)) {
    const [applicant] = await db
      .update(applicants)
      .set({ profilePictureUrl: pictureParsed.data.profilePictureUrl, updatedAt: new Date() })
      .where(eq(applicants.id, applicantId))
      .returning();

    if (chronosUserId) {
      await db
        .update(users)
        .set({ profilePictureUrl: pictureParsed.data.profilePictureUrl, updatedAt: new Date() })
        .where(eq(users.id, chronosUserId));
    }

    return NextResponse.json({ user: applicant });
  }

  // Password update
  const pwParsed = passwordSchema.safeParse(body);
  if (pwParsed.success) {
    if (!chronosUserId) return NextResponse.json({ error: "Password management is not linked yet for this account" }, { status: 409 });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, chronosUserId))
      .limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const valid = await bcrypt.compare(pwParsed.data.currentPassword, user.password);
    if (!valid) return NextResponse.json({ error: "Current password incorrect" }, { status: 400 });

    const hashed = await bcrypt.hash(pwParsed.data.newPassword, 12);
    await db
      .update(users)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(users.id, chronosUserId));
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
